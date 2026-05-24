const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary with your credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Setup the storage engine for Multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Determine the folder based on file type (optional but good for organization)
    let folderName = 'noteloom_general';
    if (file.mimetype.includes('image')) folderName = 'noteloom_images';
    else if (file.mimetype.includes('video')) folderName = 'noteloom_videos';
    else if (file.mimetype === 'application/pdf') folderName = 'noteloom_pdfs';

    return {
      folder: folderName,
      // allowedFormats: ['jpeg', 'png', 'jpg', 'pdf', 'mp4'], // Optional: restrict types
      resource_type: 'auto' // Crucial for allowing PDFs and Videos, not just images
    };
  },
});

const uploadCloud = multer({ storage: storage });

module.exports = { cloudinary, uploadCloud };