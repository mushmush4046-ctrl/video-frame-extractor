const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Multer upload setup
const upload = multer({
  dest: '/tmp/uploads/'
});

// Serve extracted frames
app.use('/frames', express.static('/tmp'));

// Extract frames endpoint
app.post('/extract-frames', upload.single('file'), async (req, res) => {

  const videoId = uuidv4();

  const videoPath = path.join('/tmp', `${videoId}.mp4`);
  const frameFolder = path.join('/tmp', `${videoId}_frames`);

  try {

    // Validate upload
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded'
      });
    }

    // Create frame folder
    await fsPromises.mkdir(frameFolder, { recursive: true });

    // Move uploaded file
    await fsPromises.rename(req.file.path, videoPath);

    // Extract frames
    await new Promise((resolve, reject) => {

      ffmpeg(videoPath)
        .output(path.join(frameFolder, 'frame-%03d.jpg'))
        .outputOptions([
          '-vf fps=1'
        ])
        .on('end', resolve)
        .on('error', reject)
        .run();

    });

    // Read generated frames
    const files = await fsPromises.readdir(frameFolder);

    const baseUrl =
      process.env.RAILWAY_STATIC_URL ||
      `http://localhost:${PORT}`;

    // Generate URLs
    const frameUrls = files.map(file => ({
      frame: file,
      url: `${baseUrl}/frames/${videoId}_frames/${file}`
    }));

    // Response
    res.json({
      success: true,
      totalFrames: frameUrls.length,
      frames: frameUrls
    });

    // Cleanup uploaded video
    await fsPromises.unlink(videoPath);

  } catch (error) {

    console.error('Pipeline Error:', error);

    if (!res.headersSent) {
      res.status(500).json({
        error: error.message
      });
    }
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
