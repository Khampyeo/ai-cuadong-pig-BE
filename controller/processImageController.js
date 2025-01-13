const axios = require("axios");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const FormData = require("form-data");
const path = require("path");
const { sendProgressToUser } = require("../wsServer");
const { startProgressUpdater, deleteFile } = require("../utils");

const upload = multer({ dest: process.env.UPLOAD_DIR || "uploads/" });

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
    const formData = new FormData();
    formData.append(
      "file",
      fs.createReadStream(imageFile.path),
      imageFile.originalname
    );

    const apiResponse = await axios.post(
      `${process.env.API_BASE_URL}/api/v1/detect/image`,
      formData,
      { headers: { ...formData.getHeaders() } }
    );

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
    await deleteFile(imageFile.path);
  }
};

// Process Video
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
    const formData = new FormData();
    formData.append(
      "file",
      fs.createReadStream(videoFile.path),
      videoFile.originalname
    );

    const uploadInterval = startProgressUpdater(userId, 0, 29, 1000);
    const apiResponse = await axios.post(
      `${process.env.API_BASE_URL}/api/v1/detect/video`,
      formData,
      { headers: { ...formData.getHeaders() } }
    );
    clearInterval(uploadInterval);
    sendProgressToUser(userId, 30);

    if (apiResponse.status === 200 && apiResponse.data.result_path) {
      const fetchInterval = startProgressUpdater(userId, 31, 74, 1500);
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
        ffmpeg(tempInputPath)
          .videoCodec("libx264")
          .outputOptions("-preset fast")
          .outputOptions("-crf 23")
          .on("progress", (info) => {
            const progress = 75 + Math.floor(info.percent / 4);
            sendProgressToUser(userId, progress);
          })
          .save(tempOutputPath)
          .on("end", async () => {
            sendProgressToUser(userId, 100);
            res.download(tempOutputPath, async () => {
              await deleteFile(tempInputPath);
              await deleteFile(tempOutputPath);
            });
          })
          .on("error", async (err) => {
            console.error("FFmpeg error:", err.message);
            await deleteFile(tempInputPath);
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
    await deleteFile(videoFile.path);
  }
};

module.exports = { processImageController, processVideoController, upload };
