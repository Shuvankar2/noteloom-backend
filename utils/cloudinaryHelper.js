const { cloudinary } = require('../config/cloudinary');

/**
 * Parses the Cloudinary URL to extract the public ID and deletes it.
 * @param {string} url - The complete Cloudinary URL.
 * @returns {Promise<object|null>} - Deletion response from Cloudinary API or null.
 */
const deleteFromCloudinary = async (url) => {
  if (!url || typeof url !== 'string') return null;
  
  try {
    const parts = url.split('/upload/');
    if (parts.length < 2) return null;
    
    // Format: v1234567890/folder/filename.ext or folder/filename.ext
    const pathParts = parts[1].split('/');
    
    // If the first part is a version tag (e.g. starts with 'v' and is numeric), skip it
    if (pathParts[0].startsWith('v') && !isNaN(pathParts[0].substring(1))) {
      pathParts.shift();
    }
    
    const fullPath = pathParts.join('/');
    
    // Strip file extension (e.g. .pdf, .jpg)
    const lastDotIndex = fullPath.lastIndexOf('.');
    const publicId = lastDotIndex === -1 ? fullPath : fullPath.substring(0, lastDotIndex);
    
    // Detect resource type
    let resourceType = 'raw'; // Default for documents/PDFs
    if (url.includes('/noteloom_images/')) {
      resourceType = 'image';
    } else if (url.includes('/noteloom_videos/')) {
      resourceType = 'video';
    }
    
    console.log(`🧹 Attempting Cloudinary deletion for publicId: "${publicId}" (type: ${resourceType})`);
    
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    console.log(`✅ Cloudinary deletion result:`, result);
    return result;
  } catch (error) {
    console.error('❌ Cloudinary asset deletion failed:', error);
    return null;
  }
};

module.exports = { deleteFromCloudinary };
