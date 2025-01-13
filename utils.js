const fs = require("fs");
const { sendProgressToUser } = require("./wsServer");

const startProgressUpdater = (userId, start, end, intervalTime = 1000) => {
  let progress = start;
  const interval = setInterval(() => {
    progress = Math.min(progress + 1, end);
    sendProgressToUser(userId, progress);

    if (progress >= end) {
      clearInterval(interval);
    }
  }, intervalTime);
  return interval;
};

const deleteFile = async (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (err) {
    console.error(`Error deleting file: ${err.message}`);
  }
};

module.exports = { startProgressUpdater, deleteFile };
