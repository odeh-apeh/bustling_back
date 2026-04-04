// controllers/productController.js
const db = require("../config/db");
const fs = require("fs");
const path = require("path");
const { notifyUser } = require("../utils/helpers");

// ✅ Create Product or Service
// ✅ Create Product or Service (UPDATED with attributes)
exports.createProduct = async (req, res) => {
  try {
    const { title, description, price, category, type, attributes } = req.body;
    const sellerId = req.session.userId;
    let images = [];

    const itemType = type && ["product", "service"].includes(type.toLowerCase())
      ? type.toLowerCase()
      : "product";

    if (req.files && req.files.length > 0) {
      images = req.files.map((file) => file.filename);
    }

    // Category → return numeric ID
    let categoryId;
    const [catCheck] = await db.execute(
      "SELECT id FROM categories WHERE name = ?",
      [category]
    );

    if (catCheck.length > 0) {
      categoryId = catCheck[0].id;
    } else {
      const [fallback] = await db.execute(
        "SELECT id FROM categories WHERE name = 'Others'"
      );
      categoryId = fallback[0]?.id || null;
    }

    let attributesData = {};
    if (attributes) {
      try {
        attributesData = typeof attributes === "string"
          ? JSON.parse(attributes)
          : attributes;
      } catch (err) {
        console.error("Error parsing attributes:", err);
      }
    }

   await db.execute(
  "INSERT INTO products (seller_id, name, description, price, category_id, images, type, attributes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  [
    sellerId,
    title,
    description,
    price,
    categoryId,
    JSON.stringify(images),
    itemType,
    JSON.stringify(attributesData)
  ]
);

    notifyUser(
      sellerId,
      "Item Uploaded",
      `Your ${itemType === "service" ? "service" : "product"} "${title}" has been successfully uploaded.`
    );

    res.json({ message: `${itemType === "service" ? "Service" : "Product"} created successfully` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating product/service" });
  }
};


// ✅ Get Categories by Type
exports.getCategories = async (req, res) => {
  try {
    const { type } = req.query;
    
    let sql = "SELECT name FROM categories WHERE 1=1";
    let params = [];
    
    if (type && ['product', 'service'].includes(type.toLowerCase())) {
      sql += " AND type = ?";
      params.push(type.toLowerCase());
    }
    
    sql += " ORDER BY name";
    
    const [rows] = await db.execute(sql, params);
    const categories = rows.map(row => row.name);
    
    res.json({
      success: true,
      categories: ['All', ...categories] // Always include 'All' option
    });
    
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ 
      success: false, 
      message: "Error fetching categories" 
    });
  }
};


exports.getAllProducts = async (req, res) => {
  try {
    const { type = 'product', category, search, page = 1, limit = 20 } = req.query;
    
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offsetNum = (pageNum - 1) * limitNum;

    // Ensure valid type
    const sanitizedType = (type === 'product' || type === 'service') ? type : 'product';

    let query = `
      SELECT
        p.id,
        p.seller_id,
        p.category_id,
        p.name,
        p.description,
        p.price,
        p.image_url,
        p.created_at,
        CAST(p.images AS CHAR) AS images,
        CAST(p.attributes AS CHAR) AS attributes,
        p.location,
        p.type,
        u.name AS seller_name,
        u.location AS seller_location,
        u.id AS seller_id
      FROM products p
      LEFT JOIN users u ON p.seller_id = u.id
      WHERE p.type = ?
    `;

    const params = [sanitizedType];

    // Category filter
    if (category && category !== 'All') {
      query += ' AND p.category_id = ?';
      params.push(category);
    }

    // Search filter
    if (search) {
      query += ' AND (p.name LIKE ? OR p.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // FINAL ORDER BY + LIMIT/OFFSET (no placeholders)
    query += ` ORDER BY p.created_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;

    console.log('🔍 Query:', query);
    console.log('📋 Params:', params);
    console.log('🔢 Types:', params.map(p => typeof p));

    const [products] = await db.execute(query, params);

    const formatted = products.map(product => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      category_id: product.category_id,
      type: product.type,
      seller_name: product.seller_name,
      seller_id: product.seller_id,
      location: product.seller_location,
      images: product.images ? JSON.parse(product.images) : [],
      created_at: product.created_at
    }));

    res.json({
      success: true,
      products: formatted,
      count: formatted.length,
      pagination: {
        page: pageNum,
        limit: limitNum
      }
    });

  } catch (error) {
    console.error('❌ Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
};


// ✅ Get Product/Service by ID (UPDATED with attributes)
exports.getProductById = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT p.*, 
             c.name as category_name, 
             c.type as category_type,
             c.attributes as category_attributes,
             u.name as seller_name, 
             u.location as seller_location 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.seller_id = u.id 
      WHERE p.id = ?
    `, [req.params.id]);
    
    if (rows.length === 0) return res.status(404).json({ message: "Item not found" });

    const item = rows[0];
    if (item.images) {
      try {
        // Remove unexpected characters if present
        const cleaned = item.images.toString().trim();
        item.images = JSON.parse(cleaned);
      } catch (error) {
          console.error('Error parsing product images:', error, 'Value:', item.images);
          item.images = [];
      }
    } else {
        item.images = [];
    }
    
    // Parse product attributes
    if (item.attributes) {
      try {
        const cleanedAttr = item.attributes.toString().trim();
        item.attributes = JSON.parse(cleanedAttr);
      } catch (error) {
          console.error('Error parsing product attributes:', error, 'Value:', item.attributes);
          item.attributes = {};
      }
    } else {
        item.attributes = {};
    }
    
    // Parse category attributes
    if (item.category_attributes) {
      try {
        const cleanedCatAttr = item.category_attributes.toString().trim();
        categoryAttributes = JSON.parse(cleanedCatAttr);
      } catch (error) {
          console.error('Error parsing category attributes:', error, 'Value:', item.category_attributes);
          categoryAttributes = [];
      }
  }
    
    // Return enhanced response
    res.json({
      id: item.id,
      title: item.title,
      description: item.description,
      price: item.price,
      category: item.category,
      type: item.type,
      images: item.images,
      seller_name: item.seller_name,
      seller_location: item.seller_location,
      seller_id: item.seller_id,
      created_at: item.created_at,
      attributes: item.attributes, // Product-specific attributes
      category_info: {
        name: item.category_name,
        type: item.category_type,
        attributes: categoryAttributes // Category definition attributes
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching item" });
  }
};

// ✅ Update Product/Service
// ✅ Update Product/Service (UPDATED with attributes)
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, price, category, type, attributes } = req.body; // Added attributes
    const sellerId = req.session.userId;

    const [rows] = await db.execute("SELECT * FROM products WHERE id=? AND seller_id=?", [id, sellerId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Item not found or not yours" });
    }

    const product = rows[0];
    let images = product.images ? JSON.parse(product.images) : [];

    if (req.files && req.files.length > 0) {
      images.forEach((img) => {
        const imgPath = path.join("uploads", img);
        if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      });
      images = req.files.map((file) => file.filename);
    }

    const finalCategory = category && category.trim() !== "" ? category : "Others";
    const itemType = type && ["product", "service"].includes(type.toLowerCase())
      ? type.toLowerCase()
      : product.type || "product";

    // Parse attributes if provided
    let attributesData = product.attributes ? JSON.parse(product.attributes) : {};
    if (attributes) {
      try {
        attributesData = typeof attributes === 'string' 
          ? JSON.parse(attributes) 
          : attributes;
      } catch (error) {
        console.error('Error parsing attributes:', error);
        // Keep existing attributes if new ones are invalid
      }
    }

    await db.execute(
      "UPDATE products SET title=?, description=?, price=?, category=?, images=?, type=?, attributes=? WHERE id=? AND seller_id=?",
      [title, description, price, finalCategory, JSON.stringify(images), itemType, JSON.stringify(attributesData), id, sellerId] // Added attributes
    );

    res.json({ message: `${itemType === "service" ? "Service" : "Product"} updated successfully` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating item" });
  }
};

// ✅ Delete Product/Service
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.session.userId;

    const [rows] = await db.execute("SELECT * FROM products WHERE id=? AND seller_id=?", [id, sellerId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Item not found or not yours" });
    }

    const product = rows[0];
    const images = product.images ? JSON.parse(product.images) : [];

    images.forEach((img) => {
      const imgPath = path.join("uploads", img);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    });

    await db.execute("DELETE FROM products WHERE id=? AND seller_id=?", [id, sellerId]);

    res.json({ message: "Item deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting item" });
  }
};

// In your productController.js
// ✅ Get Seller's Products (Fixed)
exports.getMyProducts = async (req, res) => {
  try {
    const sellerId = req.session.userId;
    
    console.log('🔍 Fetching products for seller:', sellerId);
    
    // Use ONLY columns that exist in your database
    const [products] = await db.execute(
      `SELECT 
        p.id,
        p.seller_id,
        p.name AS title,
        p.description,
        p.price,
        p.images,
        p.location,
        p.type,
        p.category_id,
        p.created_at
        -- Only include columns that actually exist in your products table
        -- Remove: p.status, p.views, p.orders if they don't exist
       FROM products p 
       WHERE p.seller_id = ? 
       ORDER BY p.created_at DESC`,
      [sellerId]
    );

    console.log('📊 Raw database results:', products);
    console.log('🔍 First product raw data:', products[0]);

    const formattedProducts = products.map(p => {
      let images = [];
      
      // Parse images from database
      if (p.images) {
        console.log(`Processing images for product ${p.id}:`, {
          rawImages: p.images,
          type: typeof p.images
        });
        
        if (typeof p.images === 'string') {
          try {
            // Remove any extra backslashes first
            let cleaned = p.images.replace(/\\/g, '');
            // Parse JSON
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed)) {
              images = parsed;
            }
          } catch (e) {
            console.log(`JSON parse error for product ${p.id}:`, e.message);
            // If not JSON, check if it's a single image string
            if (p.images.includes('.jpg') || p.images.includes('.png') || p.images.includes('.jpeg')) {
              images = [p.images];
            }
          }
        } else if (Array.isArray(p.images)) {
          images = p.images;
        }
      }
      
      // Clean image filenames
      const cleanedImages = images.map(img => 
        typeof img === 'string' 
          ? img.replace(/^["']|["']$/g, '').trim()  // Remove quotes
          : img
      );
      
      console.log(`✅ Product ${p.id} final images:`, cleanedImages);

      return {
        id: p.id,
        title: p.title || p.name,
        price: p.price,
        status: 'active', // Default since you don't have status column
        images: cleanedImages,
        created_at: p.created_at,
        views: 0, // Default since you don't have views column
        orders: 0, // Default since you don't have orders column
        description: p.description,
        location: p.location,
        type: p.type,
        category: p.category_id
      };
    });

    console.log('📦 Formatted products to send:', formattedProducts);

    res.json({
      success: true,
      products: formattedProducts
    });
  } catch (err) {
    console.error('❌ Error fetching seller products:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ 
      success: false, 
      message: "Error fetching your products" 
    });
  }
};

// ✅ Get Category Attributes (NEW)
exports.getCategoryAttributes = async (req, res) => {
  try {
    const { category_id } = req.params;
    
    const [categories] = await db.execute(
      'SELECT id, name, type, attributes FROM categories WHERE id = ?',
      [category_id]
    );
    
    if (categories.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    
    const category = categories[0];
    
    // Parse attributes
    let attributes = [];
    if (category.attributes) {
      try {
        attributes = JSON.parse(category.attributes);
      } catch (error) {
        console.error('Error parsing category attributes:', error);
        attributes = [];
      }
    }
    
    res.json({
      success: true,
      category: {
        id: category.id,
        name: category.name,
        type: category.type,
        attributes: attributes
      }
    });
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching category'
    });
  }
};

// ✅ Get All Categories with Attributes (FIXED - handles both string and object)
exports.getAllCategoriesWithAttributes = async (req, res) => {
  try {
    const { type } = req.query; // 'product' or 'service'
    
    let query = 'SELECT id, name, type, attributes FROM categories';
    const params = [];
    
    if (type) {
      query += ' WHERE type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY name';
    
    console.log('🔍 Executing query:', query);
    console.log('📋 Query params:', params);
    
    const [categories] = await db.execute(query, params);
    
    console.log('📦 Raw categories from DB:', JSON.stringify(categories, null, 2));
    
    // Parse attributes for each category
    const categoriesWithAttrs = categories.map(category => {
      console.log(`🔍 Processing category: ${category.name}`);
      console.log(`📄 Raw attributes (type: ${typeof category.attributes}):`, category.attributes);
      
      let attributes = [];
      
      if (category.attributes) {
        try {
          // Check if it's already an object/array
          if (typeof category.attributes === 'object') {
            // It's already parsed by MySQL driver
            attributes = Array.isArray(category.attributes) ? category.attributes : [];
          } else if (typeof category.attributes === 'string') {
            // It's still a string, parse it
            attributes = JSON.parse(category.attributes);
          }
          console.log(`✅ Successfully processed attributes for ${category.name}:`, attributes);
        } catch (error) {
          console.error(`❌ Error processing attributes for ${category.name}:`, error);
          console.log(`📄 Raw attributes value:`, category.attributes);
          attributes = [];
        }
      } else {
        console.log(`⚠️ No attributes found for ${category.name}`);
      }
      
      return {
        id: category.id,
        name: category.name,
        type: category.type,
        attributes: attributes
      };
    });
    
    console.log('🎉 Final categories with attributes:', JSON.stringify(categoriesWithAttrs, null, 2));
    
    res.json({
      success: true,
      categories: categoriesWithAttrs
    });
  } catch (error) {
    console.error('❌ Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching categories'
    });
  }
};