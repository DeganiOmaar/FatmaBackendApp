const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/** Avatar uploads — images only, stored under lancy/avatars */
const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "lancy/avatars",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
    transformation: [{ width: 400, height: 400, crop: "fill" }],
  },
});

/** Delivery / work-submission uploads — any file type, stored under lancy/deliveries */
const deliveryStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "lancy/deliveries",
    resource_type: "auto",          // handles images, video, pdf, zip, etc.
    public_id: `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`,
  }),
});

const uploadAvatar   = multer({ storage: avatarStorage });
const uploadDelivery = multer({
  storage: deliveryStorage,
  limits: { fileSize: 100 * 1024 * 1024, files: 20 },
});

module.exports = { cloudinary, uploadAvatar, uploadDelivery };
