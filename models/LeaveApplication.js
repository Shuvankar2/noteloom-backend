const mongoose = require('mongoose');

const leaveApplicationSchema = new mongoose.Schema({
    leaveAppId: { type: String, required: true, unique: true }, // Short ID for Barcode
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    department: { type: String, required: true }, 
    leaveType: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Declined'], default: 'Pending' },
    adminRemarks: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('LeaveApplication', leaveApplicationSchema);