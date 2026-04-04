const db = require("../config/db");

exports.registerDeliveryCompany = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();

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
    if (!companyName || !phoneNumber || !state || !localGovernment || 
        !vehicleType || !deliveryTypes || deliveryTypes.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: "All required fields must be filled" 
      });
    }

    // Check if user already has a delivery company
    const [existing] = await connection.execute(
      "SELECT id FROM delivery_companies WHERE user_id = ?",
      [userId]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: "You already have a delivery company registered"
      });
    }

    // Insert delivery company
    const [result] = await connection.execute(
      `INSERT INTO delivery_companies 
       (user_id, company_name, full_name, description, phone_number, state, local_government, coverage_area, vehicle_type, delivery_types) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Delivery company registered successfully! Your profile is under review.",
      companyId: result.insertId
    });

  } catch (err) {
    await connection.rollback();
    console.error("Delivery registration error:", err);
    
    if (err.code === 'ER_DUP_ENTRY') {
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
    connection.release();
  }
};