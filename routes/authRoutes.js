const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const validate = require('../middleware/validateMiddleware');
const { signupSchema, signinSchema } = require('../utils/validators');

// PUBLIC ROUTES
router.post('/check-email', authController.checkEmail);
router.post('/send-verification', authController.sendVerification);
router.post('/verify-email', authController.verifyEmail);
router.post('/role-signup', validate(signupSchema), authController.roleSignup);
router.post('/signin', validate(signinSchema), authController.signin);
router.post('/signout', authController.signout);
router.get('/verify-token', authController.verifyToken);
router.get('/public/colleges', authController.getPublicColleges);

module.exports = router;