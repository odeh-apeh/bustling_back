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