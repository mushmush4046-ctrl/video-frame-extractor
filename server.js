const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();

app.use(express.json());

app.post('/extract-frames', async (req, res) => {
try {
const videoUrl = req.body.videoUrl;

```
if (!videoUrl) {
  return res.status(400).json({
    error: 'videoUrl is required'
  });
}

const videoId = uuidv4();

const videoPath = path.join('/tmp', `${videoId}.mp4`);
const frameFolder = path.join('/tmp', `${videoId}_frames`);

if (!fs.existsSync(frameFolder)) {
  fs.mkdirSync(frameFolder);
}

const response = await axios({
  method: 'GET',
  url: videoUrl,
  responseType: 'stream'
});

const writer = fs.createWriteStream(videoPath);

response.data.pipe(writer);

writer.on('finish', () => {
  ffmpeg(videoPath)
    .output(path.join(frameFolder, 'frame-%03d.jpg'))
    .outputOptions([
      '-vf fps=1'
    ])
    .on('end', () => {
      const files = fs.readdirSync(frameFolder);

      const framePaths = files.map(file => ({
        frame: file,
        path: path.join(frameFolder, file)
      }));

      res.json({
        success: true,
        totalFrames: framePaths.length,
        frames: framePaths
      });
    })
    .on('error', err => {
      res.status(500).json({
        error: err.message
      });
    })
    .run();
});
```

} catch (error) {
res.status(500).json({
error: error.message
});
}
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});
