const express = require('express');
const router = express.Router();
const SystemConfig = require('../models/SystemConfig');
const TenantMenu = require('../models/TenantMenu');
const { setTenantContext, setITContext } = require('../middleware/authMiddleware');
const MASTER_FEATURES = require('../config/masterFeatures'); // We will extract this too

// Get Features
router.get('/features', async (req, res) => {
  try {
    let config = await SystemConfig.findOne({ configType: 'feature_flags' });
    if (!config) config = await SystemConfig.create({ dashboardSettings: { student: {}, faculty: {}, college_admin: {}, it_admin: {} } });
    res.json(config);
  } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

// Update Features (IT Admin)
router.post('/features', setITContext, async (req, res) => {
  if (req.itUser.role !== 'noteloom_admin') return res.status(403).json({ error: 'Access Denied' });
  const config = await SystemConfig.findOneAndUpdate({ configType: 'feature_flags' }, { dashboardSettings: req.body.dashboardSettings }, { new: true, upsert: true });
  res.json(config);
});

// Get User Dashboard Menu
router.get('/dashboard/menu', setTenantContext, async (req, res) => {
  try {
    const tenantMenu = await TenantMenu.findOne({ tenantId: req.tenant.id, role: req.role });
    let menu = MASTER_FEATURES[req.role] || [];
    if (tenantMenu) {
      menu = menu.filter(item => {
        const dbItem = tenantMenu.tabs.find(t => t.key === item.key);
        return dbItem ? dbItem.isActive : true;
      });
    }
    res.json(menu);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;