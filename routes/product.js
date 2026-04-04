const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const authMiddleware = require("../middlewares/authMiddleware");
const upload = require("../middlewares/upload");

// ✅ Get categories
router.get("/categories", productController.getCategories);

// ✅ Create product with image
router.post("/", authMiddleware, upload.array("images", 4), productController.createProduct);

router.get("/my-products", authMiddleware, productController.getMyProducts);

// ✅ Get category attributes (NEW)
router.get("/category/:category_id/attributes", productController.getCategoryAttributes);

// Add this route to your product.js routes
router.get("/categories/with-attributes", productController.getAllCategoriesWithAttributes);

// ✅ Get all products
router.get("/", productController.getAllProducts);

// ✅ Get product by ID
router.get("/:id", productController.getProductById);

// ✅ Update product
router.put("/:id", authMiddleware, upload.array("images", 4), productController.updateProduct);

// ✅ Delete product
router.delete("/:id", authMiddleware, productController.deleteProduct);

module.exports = router;