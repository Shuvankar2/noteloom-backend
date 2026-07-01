const express = require('express');
const router = express.Router();
const libraryController = require('../controllers/libraryController');
const { setTenantContext } = require('../middleware/authMiddleware'); 

// Apply authentication middleware to all library routes
router.use(setTenantContext);

// ==========================================
// 1. DIGITAL LIBRARY ROUTES
// ==========================================

// GET: Fetch Resources (With Permission Logic)
router.get('/digital', libraryController.getDigitalLibrary);

// POST: Add Resource (Handle Pending Logic)
router.post('/digital/resource', libraryController.addDigitalResource);

// PUT: Approve/Reject Resource (Admin Only)
router.put('/digital/resource/:id/status', libraryController.approveRejectResource);

// PUT: Update/Add Institutional Credentials (Admin Only)
router.put('/digital/credential', libraryController.saveLibraryCredential);

// DELETE: Delete Credential
router.delete('/digital/credential/:id', libraryController.deleteLibraryCredential);

// PUT: Edit Resource Details OR Schedule Deletion (Admin or Owner)
router.put('/digital/resource/:id', libraryController.updateDigitalResource);

// DELETE: Remove Resource (Admin or Owner)
router.delete('/digital/resource/:id', libraryController.deleteDigitalResource);

// ==========================================
// 2. PHYSICAL LIBRARY ROUTES
// ==========================================

// GET: Fetch Physical Books Catalog
router.get('/physical', libraryController.getPhysicalBooks);

// GET: Fetch User Details and holdings for Circulation (Admin Only)
router.get('/physical/user/:identifier', libraryController.getCirculationUser);

// GET: Fetch Copy Details (For Return Search Panel - Admin Only)
router.get('/physical/copy/:copyId', libraryController.getPhysicalBookCopy);

// POST: Book Checkout (Admin Only)
router.post('/physical/checkout', libraryController.checkoutBook);

// POST: Book Return (Admin Only)
router.post('/physical/return', libraryController.returnBook);

// DELETE: Remove Book Copy (Admin Only)
router.delete('/physical/copy/:copyId', libraryController.deleteBookCopy);

module.exports = router;