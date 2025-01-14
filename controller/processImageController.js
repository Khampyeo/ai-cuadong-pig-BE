const axios = require("axios");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const FormData = require("form-data");
const path = require("path");
const { sendProgressToUser } = require("../wsServer");
const { startProgressUpdater, deleteFile } = require("../utils");

// Configure multer with file size and type limits
const upload = multer({
  dest: process.env.UPLOAD_DIR || "uploads/",
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ["image/jpeg", "image/png", "video/mp4"];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Invalid file type"), false);
    }
    cb(null, true);
  },
});

// Helper to upload file to API
const uploadFileToAPI = async (file, endpoint) => {
  const formData = new FormData();
  formData.append("file", fs.createReadStream(file.path), file.originalname);

  const response = await axios.post(
    `${process.env.API_BASE_URL}${endpoint}`,
    formData,
    { headers: { ...formData.getHeaders() } }
  );

  return response;
};

// Helper to clean up temporary files
const cleanupFiles = async (files) => {
  for (const file of files) {
    try {
      await deleteFile(file);
      console.log(`Deleted file: ${file}`);
    } catch (err) {
      console.error(`Error deleting file ${file}:`, err.message);
    }
  }
};

// Process Image Controller
const processImageController = async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  const imageFile = req.file;
  if (!imageFile) {
    return res.status(400).json({ error: "No image file uploaded" });
  }

  sendProgressToUser(userId, 0);

  try {
    const apiResponse = await uploadFileToAPI(imageFile, "/api/v1/detect/image");

    sendProgressToUser(userId, 50);

    if (apiResponse.status === 200 && apiResponse.data.result_path) {
      const filename = apiResponse.data.result_path.replace("results/", "");
      const imageResponse = await axios({
        url: `${process.env.API_BASE_URL}/api/v1/results/${filename}`,
        method: "GET",
        responseType: "stream",
      });

      sendProgressToUser(userId, 100);

      res.setHeader("Content-Type", imageResponse.headers["content-type"]);
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      imageResponse.data.pipe(res);
    } else {
      throw new Error("Result path not found");
    }
  } catch (error) {
    console.error("Error processing image:", error.message);
    res.status(500).json({ error: "Failed to process image" });
  } finally {
    await cleanupFiles([imageFile.path]);
  }
};

// Process Video Controller
const processVideoController = async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  const videoFile = req.file;
  if (!videoFile) {
    return res.status(400).json({ error: "No video file uploaded" });
  }

  sendProgressToUser(userId, 0);

  try {
    const uploadInterval = startProgressUpdater(userId, 0, 29, 1000);
    const apiResponse = await uploadFileToAPI(videoFile, "/api/v1/detect/video");
    clearInterval(uploadInterval);
    sendProgressToUser(userId, 30);

    if (apiResponse.status === 200 && apiResponse.data.result_path) {
      const fetchInterval = startProgressUpdater(userId, 31, 60, 1500);
      const filename = apiResponse.data.result_path.replace("results/", "");
      const videoResponse = await axios({
        url: `${process.env.API_BASE_URL}/api/v1/results/${filename}`,
        method: "GET",
        responseType: "stream",
      });
      const tempInputPath = path.join("temp", `input_${Date.now()}.mp4`);
      const tempOutputPath = path.join("temp", `output_${Date.now()}.mp4`);
      const writer = fs.createWriteStream(tempInputPath);
      videoResponse.data.pipe(writer);

      writer.on("finish", () => {
        clearInterval(fetchInterval);
        sendProgressToUser(userId, 61);
        ffmpeg(tempInputPath)
          .videoCodec("libx264")
          .outputOptions("-preset", "fast")
          .outputOptions("-crf", "23")
          .on("progress", (info) => {
            if (info.percent < 0 || info.percent > 100 || isNaN(info.percent)) {
              console.error("Invalid FFmpeg progress:", info.percent);
              return;
            }
            const progress = 61 + Math.floor(info.percent / 5);
            sendProgressToUser(userId, progress);
          })
          .save(tempOutputPath)
          .on("end", async () => {
            try {
              res.download(tempOutputPath, async (err) => {
                if (err) {
                  console.error("Error during file download:", err.message);
                  res.status(500).json({ error: "Failed to send file" });
                  await cleanupFiles([tempInputPath, tempOutputPath]);
                  return;
                }
              });

              res.on("finish", async () => {
                console.log("File download completed.");
                sendProgressToUser(userId, 91);
                await cleanupFiles([tempInputPath, tempOutputPath]);
              });
            } catch (error) {
              console.error("Error during finalization:", error.message);
              res.status(500).json({ error: "Failed to process video" });
            }
          })
          .on("error", async (err) => {
            console.error("FFmpeg error:", err.message);
            await cleanupFiles([tempInputPath]);
            res.status(500).json({ error: "Failed to process video" });
          });
      });

      writer.on("error", (err) => {
        console.error("Error writing video file:", err.message);
        res.status(500).json({ error: "Failed to fetch video" });
      });
    } else {
      throw new Error("Result path not found");
    }
  } catch (error) {
    console.error("Error processing video:", error.message);
    res.status(500).json({ error: "Failed to process video" });
  } finally {
    await cleanupFiles([videoFile.path]);
  }
};

module.exports = { processImageController, processVideoController, upload };