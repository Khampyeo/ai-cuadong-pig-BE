const express = require("express");
const router = require("./routes");
const cors = require("cors");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT;
app.use(cors());

app.use("/api", router);

app.listen(PORT, () => {
  console.log(`HTTP server is running on http://localhost:${PORT}`);
});
