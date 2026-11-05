import { Router } from "express";

import authRoutes from "./auth.routes.js";
import rolesRouter from "./roles.route.js";
import permissionsRouter from "./permissons.route.js";
import staffRouter from "./staff.routes.js";
import shiftsRouter from "./shifts.routes.js";
import dutyRostersRouter from "./dutyRosters.routes.js";
import dutiesRouter from "./duties.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/roles", rolesRouter);
router.use("/permissions", permissionsRouter);
router.use("/staff", staffRouter);
router.use("/shifts",shiftsRouter);
router.use("/duty-rosters",dutyRostersRouter);
router.use("/duties",dutiesRouter);


export default router;
