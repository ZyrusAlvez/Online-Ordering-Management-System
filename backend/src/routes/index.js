import { Router } from 'express';
import adminRoutes from './admin.routes.js';
import authRoutes from './auth.routes.js';
import categoriesRoutes from './categories.routes.js';
import healthRoutes from './health.routes.js';
import kioskRoutes from './kiosk.routes.js';
import menuRoutes from './menu.routes.js';
import ordersRoutes from './orders.routes.js';
import posRoutes from './pos.routes.js';
import productsRoutes from './products.routes.js';
import riderRoutes from './rider.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/menu', menuRoutes);
router.use('/categories', categoriesRoutes);
router.use('/products', productsRoutes);
router.use('/orders', ordersRoutes);

// Role-namespaced surfaces: one router per frontend.
router.use('/kiosk', kioskRoutes);
router.use('/pos', posRoutes);
router.use('/rider', riderRoutes);
router.use('/admin', adminRoutes);

export default router;
