// import supportRoutes from "./routes/support";
import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import { startJobScheduler } from "./services/jobScheduler.js";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
// app.use("/api/support", supportRoutes);

// Start background job fetching scheduler
startJobScheduler();

export default app;
