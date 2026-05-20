const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs').promises; // Use promise-based FS
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { pipeline } = require('stream/promises'); // Modern stream handling

const app = express();
app.use(express.json());

// Serving the /tmp folder statically
app.use('/frames', express.static('/tmp'));

app.post('/extract-frames', async (req, res) => {
  const videoId = uuidv4();
  const videoPath = path.join('/tmp', `${videoId}.mp4`);
  const frameFolder = path.join('/tmp', `${videoId}_frames`);
  
  try {
    const { videoUrl } = req.body;
    if (!videoUrl) return res.status(400).json({ error: 'videoUrl is required' });

    // 1. Create directory (Async)
    await fsPromises.mkdir(frameFolder, { recursive: true });

    // 2. Download Video using pipeline (more reliable than .pipe)
    const response = await axios({ method: 'GET', url: videoUrl, responseType: 'stream' });
    await pipeline(response.data, fs.createWriteStream(videoPath));

    // 3. Process with FFmpeg (Promisified)
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .output(path.join(frameFolder, 'frame-%03d.jpg'))
        .outputOptions(['-vf fps=1'])
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    // 4. Read frames and generate URLs
    const files = await fsPromises.readdir(frameFolder);
    const baseUrl = process.env.RAILWAY_STATIC_URL || `http://localhost:${PORT}`;

    const frameUrls = files.map(file => ({
      frame: file,
      url: `${baseUrl}/frames/${videoId}_frames/${file}`
    }));

    res.json({
      success: true,
      totalFrames: frameUrls.length,
      frames: frameUrls
    });

    // Optional: Cleanup the original video file to save space
    await fsPromises.unlink(videoPath);

  } catch (error) {
    console.error("Pipeline Error:", error);
    // Only send error if we haven't already sent a response
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
