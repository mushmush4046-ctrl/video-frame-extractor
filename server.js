const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { pipeline } = require('stream/promises');

const app = express();
app.use(express.json());

app.post('/extract-frames', async (req, res) => {
    const videoId = uuidv4();
    const videoPath = path.join('/tmp', `${videoId}.mp4`);
    const frameFolder = path.join('/tmp', `${videoId}_frames`);

    try {
        const { videoUrl } = req.body;
        if (!videoUrl) return res.status(400).json({ error: 'videoUrl is required' });

        // 1. Create directory asynchronously
        await fsPromises.mkdir(frameFolder, { recursive: true });

        // 2. Stream download with Pipeline (automatically handles errors/cleanup)
        const response = await axios({ method: 'GET', url: videoUrl, responseType: 'stream' });
        await pipeline(response.data, fs.createWriteStream(videoPath));

        // 3. Promisify FFmpeg processing
        await new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .output(path.join(frameFolder, 'frame-%03d.jpg'))
                .outputOptions(['-vf fps=1'])
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        // 4. Read results
        const files = await fsPromises.readdir(frameFolder);
        const framePaths = files.map(file => ({
            frame: file,
            path: path.join(frameFolder, file)
        }));

        res.json({
            success: true,
            totalFrames: framePaths.length,
            frames: framePaths
        });

        // Optional: Trigger a background cleanup task here

    } catch (error) {
        console.error('Processing Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    } finally {
        // Cleanup local temp video file
        if (fs.existsSync(videoPath)) {
            fsPromises.unlink(videoPath).catch(err => console.error("Cleanup Error:", err));
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
