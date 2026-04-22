const db = require("../config/db");

exports.registerDeliveryCompany = async (req, res) => {
  const client = await db.getConnection();
  
  try {
    await client.query('BEGIN');

    const userId = req.session.userId;
    const { 
      companyName, 
      fullName, 
      description, 
      phoneNumber, 
      state, 
      localGovernment, 
      vehicleType, 
      deliveryTypes,
      coverageArea
      // Removed: basePrice, pricePerKm
    } = req.body;

    // Validate required fields
    if (!companyName || !phoneNumber || !state || !localGovernment) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false,
        message: "All required fields must be filled" 
      });
    }

    // Check if user already has a delivery company
    const existing = await client.query(
      "SELECT id FROM delivery_companies WHERE user_id = $1",
      [userId]
    );

    // if (existing.rows.length > 0) {
    //   await client.query('ROLLBACK');
    //   return res.status(400).json({
    //     success: false,
    //     message: "You already have a delivery company registered"
    //   });
    // }

    // Insert delivery company - PostgreSQL uses RETURNING id instead of insertId
    const result = await client.query(
      `INSERT INTO delivery_companies 
       (user_id, company_name, full_name, description, phone_number, state, local_government, coverage_area, vehicle_type, delivery_types) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
       RETURNING id`,
      [
        userId,
        companyName,
        fullName || null,
        description || null,
        phoneNumber,
        state,
        localGovernment,
        coverageArea,
        vehicleType,
        JSON.stringify(deliveryTypes)
        // Removed: base_fee, price_per_km
      ]
    );

    const companyId = result.rows[0].id;

    await client.query('COMMIT');
        await db.query('INSERT INTO notifications (user_id, message) VALUES ($1, $2)', [userId, "Your delivery company has been registered successfully."]);

    res.status(201).json({
      success: true,
      message: "Delivery company registered successfully!",
      companyId: companyId
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Delivery registration error:", err);
    
    // PostgreSQL unique violation error code is '23505'
    if (err.code === '23505') {
      return res.status(400).json({
        success: false,
        message: "Delivery company already exists for this user"
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Server error during registration"
    });
  } finally {
    client.release();
  }
};


// Update delivery company by company ID
exports.updateDeliveryCompany = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params; // Get delivery company ID from params
    const { 
      companyName, 
      fullName, 
      description, 
      phoneNumber, 
      state, 
      localGovernment, 
      coverageArea, 
      vehicleType, 
      deliveryTypes 
    } = req.body;

    console.log('📦 Update Delivery Request:', {
      companyId: id,
      userId,
      companyName,
      phoneNumber,
      state,
      localGovernment,
      coverageArea,
      vehicleType,
      deliveryTypes
    });

    // Check authentication
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    // Validate required fields
    if (!companyName || !phoneNumber || !state || !localGovernment || !coverageArea || !vehicleType || !deliveryTypes) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
        missing: {
          companyName: !companyName,
          phoneNumber: !phoneNumber,
          state: !state,
          localGovernment: !localGovernment,
          coverageArea: !coverageArea,
          vehicleType: !vehicleType,
          deliveryTypes: !deliveryTypes
        }
      });
    }

    // Check if delivery company exists and belongs to this user
    const existingCompany = await db.query(
      "SELECT * FROM delivery_companies WHERE id = $1 AND user_id = $2",
      [id, userId]
    );

    if (existingCompany.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Delivery company not found or you don't have permission to update it"
      });
    }

    // Update existing record
    const result = await db.query(
      `UPDATE delivery_companies 
       SET 
         company_name = $1,
         full_name = $2,
         description = $3,
         phone_number = $4,
         state = $5,
         local_government = $6,
         coverage_area = $7,
         vehicle_type = $8,
         delivery_types = $9,
         updated_at = NOW()
       WHERE id = $10 AND user_id = $11
       RETURNING *`,
      [
        companyName,
        fullName || null,
        description || null,
        phoneNumber,
        state,
        localGovernment,
        coverageArea,
        vehicleType,
        JSON.stringify(deliveryTypes),
        id,
        userId
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Failed to update delivery company"
      });
    }
    
    console.log('✅ Delivery company updated successfully for ID:', id);
    
    return res.status(200).json({
      success: true,
      message: "Delivery company updated successfully",
      company: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error updating delivery company:', error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error during update"
    });
  }
};

// Delete delivery company by ID
exports.deleteDeliveryCompany = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;

    console.log('🗑️ Delete Delivery Request for company ID:', id);

    // Check authentication
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    // Check if delivery company exists and belongs to this user
    const existingCompany = await db.query(
      "SELECT * FROM delivery_companies WHERE id = $1 AND user_id = $2",
      [id, userId]
    );

    if (existingCompany.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Delivery company not found or you don't have permission to delete it"
      });
    }

    // Delete the delivery company
    const result = await db.query(
      "DELETE FROM delivery_companies WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Failed to delete delivery company"
      });
    }

    console.log('✅ Delivery company deleted successfully for ID:', id);

    return res.status(200).json({
      success: true,
      message: "Delivery company deleted successfully",
      deletedCompany: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error deleting delivery company:', error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error during deletion"
    });
  }
};

// Soft delete (deactivate) by company ID
exports.softDeleteDeliveryCompany = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;

    console.log('🗑️ Soft Delete Request for company ID:', id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    // Check if delivery company exists and belongs to this user
    const existingCompany = await db.query(
      "SELECT * FROM delivery_companies WHERE id = $1 AND user_id = $2",
      [id, userId]
    );

    if (existingCompany.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Delivery company not found or you don't have permission to modify it"
      });
    }

    // Soft delete - set status to 'deleted' instead of removing from db
    const result = await db.query(
      `UPDATE delivery_companies 
       SET status = 'deleted', deleted_at = NOW(), updated_at = NOW() 
       WHERE id = $1 AND user_id = $2 
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Failed to delete delivery company"
      });
    }

    console.log('✅ Delivery company soft deleted for ID:', id);

    return res.status(200).json({
      success: true,
      message: "Delivery company deactivated successfully",
      company: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error soft deleting delivery company:', error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error during deletion"
    });
  }
};

// Permanent delete (hard delete) by company ID
exports.hardDeleteDeliveryCompany = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;
    const { confirm } = req.body;

    console.log('🗑️ Hard Delete Request for company ID:', id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    // Require confirmation for hard delete
    if (!confirm || confirm !== 'CONFIRM_DELETE') {
      return res.status(400).json({
        success: false,
        message: "Please confirm deletion by providing confirm: 'CONFIRM_DELETE'"
      });
    }

    // Check if delivery company exists and belongs to this user
    const existingCompany = await db.query(
      "SELECT * FROM delivery_companies WHERE id = $1 AND user_id = $2",
      [id, userId]
    );

    if (existingCompany.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Delivery company not found or you don't have permission to delete it"
      });
    }

    // Permanent delete from db
    const result = await db.query(
      "DELETE FROM delivery_companies WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Failed to delete delivery company"
      });
    }

    console.log('✅ Delivery company permanently deleted for ID:', id);

    return res.status(200).json({
      success: true,
      message: "Delivery company permanently deleted successfully",
      deletedCompany: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error hard deleting delivery company:', error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error during deletion"
    });
  }
};

// Get delivery company by ID
exports.getDeliveryCompanyById = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;

    console.log('📖 Get Delivery Company Request for ID:', id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    const result = await db.query(
      "SELECT * FROM delivery_companies WHERE id = $1 AND user_id = $2",
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Delivery company not found"
      });
    }

    const company = result.rows[0];
    
    // Parse delivery_types if it's a string
    if (company.delivery_types && typeof company.delivery_types === 'string') {
      try {
        company.delivery_types = JSON.parse(company.delivery_types);
      } catch (e) {
        company.delivery_types = [];
      }
    }

    return res.status(200).json({
      success: true,
      company: company
    });

  } catch (error) {
    console.error('❌ Error fetching delivery company:', error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error during fetch"
    });
  }
};

exports.updateDeliveryCompanyStatus = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;
    const { status } = req.body;

    console.log('🚦 Update Delivery Company Status Request:',   
      { companyId: id, userId, status }
    );

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    // Validate status value
    const validStatuses = ['active', 'inactive', 'deleted'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Valid values are: ${validStatuses.join(', ')}`
      });
    }

    // Check if delivery company exists and belongs to this user
    const existingCompany = await db.query(
      "SELECT * FROM delivery_companies WHERE id = $1 AND user_id = $2",
      [id, userId]
    );

    if (existingCompany.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Delivery company not found or you don't have permission to update it"
      });
    }

    // Update status
    const result = await db.query(
      `UPDATE delivery_companies 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2 AND user_id = $3 
       RETURNING *`,
      [status, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Failed to update delivery company status"
      });
    }

    console.log('✅ Delivery company status updated for ID:', id);

    return res.status(200).json({
      success: true,
      message: "Delivery company status updated successfully",
      company: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error updating delivery company status:', error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error during status update"
    });
  }
};
