const express = require("express");
const {
  processImageController,
  upload,
  processVideoController,
} = require("../controller/processImageController");

const router = express.Router();

router.get("/health", (req, res) => {
  res.send("200");
});

//router.post("/process/video", upload.single("video"), processVideoController);
//router.post("/process/image", upload.single("image"), processImageController);
//router.get("/result/video/:filename", resultVideoController);
//router.get("/result/image/:filename", resultImageController);

router.post("/process-video", upload.single("video"), processVideoController);
router.post("/process-image", upload.single("image"), processImageController);

module.exports = router;
