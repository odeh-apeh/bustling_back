// controllers/productController.js
const database = require("../database/database-handler")
const db = require("../config/db");
const fs = require("fs");
const path = require("path");
const { notifyUser } = require("../utils/helpers");

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
    const catCheck = await db.query(
      "SELECT id FROM categories WHERE name = $1",
      [category]
    );

    let categoryId;
    if (catCheck.rows.length > 0) {
      categoryId = catCheck.rows[0].id;
    } else {
      const fallback = await db.query(
        "SELECT id FROM categories WHERE name = 'Others'"
      );
      categoryId = fallback.rows[0]?.id || null;
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

    await db.query(
      "INSERT INTO products (seller_id, name, description, price, category_id, images, type, attributes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
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
// controllers/productController.js - Updated getCategories
exports.getCategories = async (req, res) => {
  try {
    const { type } = req.query;
    
    let sql = "SELECT id, name FROM categories WHERE 1=1";
    let params = [];
    let paramCounter = 1;
    
    if (type && ['product', 'service'].includes(type.toLowerCase())) {
      sql += ` AND type = $${paramCounter}`;
      params.push(type.toLowerCase());
      paramCounter++;
    }
    
    sql += " ORDER BY name";
    
    const result = await db.query(sql, params);
    const categories = result.rows.map(row => ({
      id: row.id,
      name: row.name
    }));
    
    res.json({
      success: true,
      categories: [{ id: null, name: 'All' }, ...categories] // 'All' option with null ID
    });
    
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ 
      success: false, 
      message: "Error fetching categories" 
    });
  }
};

// controllers/productController.js - Fixed getAllProducts
exports.getAllProducts = async (req, res) => {
  try {
    const { type = 'product', category, search, page = 1, limit = 20 } = req.query;
    
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
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
        COALESCE(p.images::text, '[]') AS images,
        COALESCE(p.attributes::text, '{}') AS attributes,
        p.location,
        p.type,
        u.name AS seller_name,
        u.location AS seller_location
      FROM products p
      LEFT JOIN users u ON p.seller_id = u.id
      WHERE p.type = $1
    `;

    const params = [sanitizedType];
    let paramCounter = 2;

    // Handle category filter
    if (category && category !== 'All' && category !== 'undefined' && category !== 'null') {
      const isNumeric = /^\d+$/.test(category);
      
      if (isNumeric) {
        query += ` AND p.category_id = $${paramCounter}`;
        params.push(parseInt(category, 10));
        paramCounter++;
      } else {
        try {
          const categoryResult = await db.query(
            "SELECT id FROM categories WHERE name = $1 LIMIT 1",
            [category]
          );
          
          if (categoryResult.rows.length > 0) {
            query += ` AND p.category_id = $${paramCounter}`;
            params.push(categoryResult.rows[0].id);
            paramCounter++;
          }
        } catch (err) {
          console.warn('⚠️ Category lookup failed:', err.message);
          // Continue without category filter
        }
      }
    }

    // Handle search filter - FIXED VERSION
    if (search && typeof search === 'string' && search.trim() && search !== 'undefined' && search !== 'null') {
      const searchTerm = `%${search.trim()}%`;
      query += ` AND (p.name ILIKE $${paramCounter} OR p.description ILIKE $${paramCounter})`;
      params.push(searchTerm);
      paramCounter++;
    }

    // Add ORDER BY, LIMIT, and OFFSET
    query += ` ORDER BY p.created_at DESC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
    params.push(limitNum, offsetNum);

    console.log('🔍 Products Query:', query);
    console.log('📋 Products Params:', params);
    console.log('📊 Page:', pageNum, 'Limit:', limitNum, 'Offset:', offsetNum);

    const result = await db.query(query, params);
    const products = result.rows;

    // Get total count for pagination (optional)
    let totalCount = products.length;
    if (products.length === limitNum) {
      // Optional: Run a separate count query for accurate pagination
      const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) as total FROM')
        .replace(/ORDER BY.*$/, '');
      const countParams = params.slice(0, -2); // Remove limit and offset params
      const countResult = await db.query(countQuery, countParams);
      totalCount = parseInt(countResult.rows[0]?.total || products.length, 10);
    }

    const formatted = products.map(product => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: parseFloat(product.price),
      category_id: product.category_id,
      type: product.type,
      seller_name: product.seller_name,
      seller_id: product.seller_id,
      location: product.location || product.seller_location,
      images: (() => {
        try {
          if (!product.images) return [];
          const parsed = JSON.parse(product.images);
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          return product.image_url ? [product.image_url] : [];
        }
      })(),
      created_at: product.created_at
    }));

    res.json({
      success: true,
      products: formatted,
      count: formatted.length,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// ✅ Get Product/Service by ID (UPDATED with attributes)
exports.getProductById = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT p.*, 
             c.name as category_name, 
             c.type as category_type,
             c.attributes as category_attributes,
             u.name as seller_name, 
             u.location as seller_location 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.seller_id = u.id 
      WHERE p.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) return res.status(404).json({ message: "Item not found" });

    const item = result.rows[0];
    let categoryAttributes = [];
    
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
      title: item.name,
      description: item.description,
      price: item.price,
      category: item.category_name,
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

// ✅ Update Product/Service (UPDATED with attributes)
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, price, category, location, existing_images } = req.body;
    const sellerId = req.session.userId;

    if(!title || !description || !price || !category || !location | !existing_images) {
     return res.status(500).json({
        message: 'All fields are required'
      })
    }

    console.log('📦 Update Request Body:', req.body);
    console.log('📦 Files:', req.files);

    // Check if product exists and belongs to seller
    const result = await db.query(
      "SELECT * FROM products WHERE id=$1 AND seller_id=$2", 
      [id, sellerId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Item not found or not yours" 
      });
    }

    const product = result.rows[0];
    
    // Handle images
    let images = [];
    
    // Parse existing images from request
    if (existing_images) {
      try {
        images = JSON.parse(existing_images);
      } catch (e) {
        images = [];
      }
    } else {
      // If no existing_images provided, keep current images
      images = product.images ? JSON.parse(product.images) : [];
    }
    
    // Handle new image uploads
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((file) => file.filename);
      images = [...images, ...newImages];
    }

    // Handle category
    let categoryId = product.category_id;
    if (category) {
      if (!isNaN(parseInt(category))) {
        categoryId = parseInt(category);
      } else {
        const categoryResult = await db.query(
          "SELECT id FROM categories WHERE name ILIKE $1 LIMIT 1",
          [category]
        );
        if (categoryResult.rows.length > 0) {
          categoryId = categoryResult.rows[0].id;
        }
      }
    }

    // Build update query (without status column)
    const updateFields = [];
    const updateValues = [];
    let paramCounter = 1;

    if (title !== undefined) {
      updateFields.push(`name = $${paramCounter++}`);
      updateValues.push(title);
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramCounter++}`);
      updateValues.push(description);
    }
    if (price !== undefined) {
      updateFields.push(`price = $${paramCounter++}`);
      updateValues.push(price);
    }
    if (categoryId !== undefined) {
      updateFields.push(`category_id = $${paramCounter++}`);
      updateValues.push(categoryId);
    }
    if (images !== undefined) {
      updateFields.push(`images = $${paramCounter++}`);
      updateValues.push(JSON.stringify(images));
    }
    if (location !== undefined) {
      updateFields.push(`location = $${paramCounter++}`);
      updateValues.push(location);
    }

    // Always update updated_at
    updateFields.push(`created_at = NOW()`);

    // Add WHERE clause values
    updateValues.push(id);
    updateValues.push(sellerId);

    const updateQuery = `
      UPDATE products 
      SET ${updateFields.join(', ')} 
      WHERE id = $${paramCounter++} AND seller_id = $${paramCounter}
      RETURNING *
    `;

    console.log('📝 Update Query:', updateQuery);
    console.log('📊 Update Values:', updateValues);

    const updatedResult = await db.query(updateQuery, updateValues);
    
    if (updatedResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Failed to update product"
      });
    }

    // Return success response
    return res.status(200).json({ 
      success: true,
      message: "Product updated successfully",
      product: updatedResult.rows[0]
    });

  } catch (err) {
    console.error('❌ Error updating product:', err);
    return res.status(500).json({ 
      success: false,
      message: "Error updating item",
      error: err.message 
    });
  }
};

// Delete product controller (fixed)
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.session.userId;

    console.log('🗑️ Delete Request:', { id, sellerId });

    // Check if product exists and belongs to seller
    const result = await db.query(
      "SELECT * FROM products WHERE id=$1 AND seller_id=$2", 
      [id, sellerId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Item not found or not yours" 
      });
    }

    const product = result.rows[0];
    
    // Parse and delete image files
    if (product.images) {
      try {
        const images = JSON.parse(product.images);
        if (images && images.length > 0) {
          images.forEach((img) => {
            const imgPath = path.join(__dirname, "..", "uploads", img);
            if (fs.existsSync(imgPath)) {
              fs.unlinkSync(imgPath);
              console.log('🗑️ Deleted image file:', img);
            }
          });
        }
      } catch (e) {
        console.error('Error parsing images for deletion:', e);
      }
    }

    // Delete from database
    await db.query(
      "DELETE FROM products WHERE id=$1 AND seller_id=$2", 
      [id, sellerId]
    );

    console.log('✅ Product deleted successfully:', id);

    res.json({ 
      success: true,
      message: "Item deleted successfully" 
    });

  } catch (err) {
    console.error('❌ Error deleting product:', err);
    res.status(500).json({ 
      success: false,
      message: "Error deleting item",
      error: err.message 
    });
  }
};

// Optional: Add status toggle if you add status column later
exports.toggleProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const sellerId = req.session.userId;

    // First check if status column exists
    const checkColumn = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='products' AND column_name='status'
    `);

    if (checkColumn.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Status column not found in products table. Please run migration: ALTER TABLE products ADD COLUMN status VARCHAR(20) DEFAULT 'active'"
      });
    }

    // Check if product exists
    const result = await db.query(
      "SELECT * FROM products WHERE id=$1 AND seller_id=$2", 
      [id, sellerId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Item not found or not yours" 
      });
    }

    // Update status
    await db.query(
      "UPDATE products SET status = $1, updated_at = NOW() WHERE id = $2 AND seller_id = $3",
      [status, id, sellerId]
    );

    return res.status(200).json({ 
      success: true,
      message: `Product ${status === 'active' ? 'activated' : 'deactivated'} successfully`
    });

  } catch (err) {
    console.error('❌ Error toggling status:', err);
    return res.status(500).json({ 
      success: false,
      message: "Error updating product status",
      error: err.message 
    });
  }
};

// Controller for JSON-only updates
exports.updateProductJson = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, price, category, location, status } = req.body;
    const sellerId = req.session.userId;

    console.log('📦 JSON Update Request:', req.body);

    // Check if product exists
    const result = await db.query(
      "SELECT * FROM products WHERE id=$1 AND seller_id=$2", 
      [id, sellerId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Item not found or not yours" 
      });
    }

    const product = result.rows[0];

    // Handle category
    let categoryId = product.category_id;
    if (category) {
      if (!isNaN(parseInt(category))) {
        categoryId = parseInt(category);
      } else {
        const categoryResult = await db.query(
          "SELECT id FROM categories WHERE name ILIKE $1 LIMIT 1",
          [category]
        );
        if (categoryResult.rows.length > 0) {
          categoryId = categoryResult.rows[0].id;
        }
      }
    }

    // Update without touching images
    const updateQuery = `
      UPDATE products 
      SET 
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        price = COALESCE($3, price),
        category_id = COALESCE($4, category_id),
        location = COALESCE($5, location),
        status = COALESCE($6, status),
        updated_at = NOW()
      WHERE id = $7 AND seller_id = $8
      RETURNING *
    `;

    const updateValues = [
      title,
      description,
      price,
      categoryId,
      location,
      status,
      id,
      sellerId
    ];

    const updatedResult = await db.query(updateQuery, updateValues);
    
    return res.status(200).json({ 
      success: true,
      message: "Product updated successfully",
      product: updatedResult.rows[0]
    });

  } catch (err) {
    console.error('❌ Error updating product:', err);
    return res.status(500).json({ 
      success: false,
      message: "Error updating item",
      error: err.message 
    });
  }
};


// ✅ Get Seller's Products (Fixed)
exports.getMyProducts = async (req, res) => {
  try {
    const sellerId = req.session.userId;
    
    console.log('🔍 Fetching products for seller:', sellerId);
    
    // Use ONLY columns that exist in your database
    const result = await db.query(
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
       FROM products p 
       WHERE p.seller_id = $1 
       ORDER BY p.created_at DESC`,
      [sellerId]
    );

    const products = result.rows;

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
    
    const result = await db.query(
      'SELECT id, name, type, attributes FROM categories WHERE id = $1',
      [category_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    
    const category = result.rows[0];
    
    // Parse attributes
    let attributes = [];
    if (category.attributes) {
      try {
        attributes = typeof category.attributes === 'string' 
          ? JSON.parse(category.attributes) 
          : category.attributes;
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
    let paramCounter = 1;
    
    if (type) {
      query += ` WHERE type = $${paramCounter}`;
      params.push(type);
      paramCounter++;
    }
    
    query += ' ORDER BY name';
    
    console.log('🔍 Executing query:', query);
    console.log('📋 Query params:', params);
    
    const result = await db.query(query, params);
    const categories = result.rows;
    
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
            // It's already parsed by PostgreSQL driver
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


exports.getSellerPhone = async (req, res) => {
  const { seller_id } = req.params;
  try{
    const result = await database.findOne({
      table: 'users',
      attribute: 'id',
      value: Number(seller_id),
      item: 'phone'
    });
    
    if (!result) {
      return res.status(404).json({ success: false, message: "Seller not found", data:null });
    }
    
    res.status(200).json({ success: true, message: "Processed successfully", data: { phone: result.phone } });
  }catch(err){
    console.error(err);
    res.status(500).json({ success: false, message: err.message, data:null });
  }
}