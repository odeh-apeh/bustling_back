const db = require('../config/db');

class Database {
  // =========================
  // ERROR HANDLER
  // =========================
  throwError(message) {
    throw new Error(message ?? 'No data found in table');
  }

  // =========================
  // INTERNAL HELPERS
  // =========================
  async queryOne(query, values = []) {
    const data = await db.query(query, values);

    if (data.rows.length === 0) {
      this.throwError();
    }

    return data.rows[0];
  }

  async queryMany(query, values = []) {
    const data = await db.query(query, values);

    if (data.rows.length === 0) {
      this.throwError();
    }

    return data.rows;
  }

  // =========================
  // FIND ONE BY ID
  // =========================
  async findOneById({ id, table, item = '*', attribute = 'id' }) {
    try {
      const query = `
        SELECT ${item}
        FROM ${table}
        WHERE ${attribute} = $1
        LIMIT 1;
      `;
      return await this.queryOne(query, [id]);
    } catch (e) {
      this.throwError(e.message);
    }
  }

  // =========================
  // FIND ONE BY ANY ATTRIBUTE
  // =========================
  async findOne({ table, attribute, value, item = '*' }) {
    try {
      const query = `
        SELECT ${item}
        FROM ${table}
        WHERE ${attribute} = $1
        LIMIT 1;
      `;
      return await this.queryOne(query, [value]);
    } catch (e) {
      this.throwError(e.message);
    }
  }

  // =========================
  // FIND ALL MATCHING ROWS
  // =========================
  async findAll({ table, attribute, attributeValue }) {
    try {
      const query = `
        SELECT *
        FROM ${table}
        WHERE ${attribute} = $1;
      `;
      return await this.queryMany(query, [attributeValue]);
    } catch (e) {
      this.throwError(e.message);
    }
  }

  // =========================
  // FIND ONE BY EMAIL
  // =========================
  async findOneByEmail({ email, table, attribute = 'email', item = '*' }) {
    try {
      const query = `
        SELECT ${item}
        FROM ${table}
        WHERE ${attribute} = $1
        LIMIT 1;
      `;
      return await this.queryOne(query, [email]);
    } catch (e) {
      this.throwError(e.message);
    }
  }

  // =========================
  // INSERT ONE ROW
  // =========================
  async insert({ table, data }) {
    try {
      const keys = Object.keys(data);
      const values = Object.values(data);

      const columns = keys.join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

      const query = `
        INSERT INTO ${table} (${columns})
        VALUES (${placeholders})
        RETURNING *;
      `;

      return await this.queryOne(query, values);
    } catch (e) {
      this.throwError(e.message);
    }
  }

  // =========================
  // UPDATE BY ID
  // =========================
  async updateById({ table, id, data, attribute = 'id' }) {
    try {
      const keys = Object.keys(data);
      const values = Object.values(data);

      const setClause = keys
        .map((key, index) => `${key} = $${index + 1}`)
        .join(', ');

      const query = `
        UPDATE ${table}
        SET ${setClause}
        WHERE ${attribute} = $${keys.length + 1}
        RETURNING *;
      `;

      return await this.queryOne(query, [...values, id]);
    } catch (e) {
      this.throwError(e.message);
    }
  }

  // =========================
  // DELETE BY ID
  // =========================
  async deleteById({ table, id, attribute = 'id' }) {
    try {
      const query = `
        DELETE FROM ${table}
        WHERE ${attribute} = $1
        RETURNING *;
      `;
      return await this.queryOne(query, [id]);
    } catch (e) {
      this.throwError(e.message);
    }
  }

  // =========================
  // CHECK IF ROW EXISTS
  // =========================
  async exists({ table, attribute, value }) {
    try {
      const query = `
        SELECT EXISTS (
          SELECT 1
          FROM ${table}
          WHERE ${attribute} = $1
        ) AS exists;
      `;

      const data = await db.query(query, [value]);
      return data.rows[0].exists;
    } catch (e) {
      this.throwError(e.message);
    }
  }

  // =========================
  // COUNT ROWS
  // =========================
  async count({ table, attribute, value }) {
    try {
      let query = `SELECT COUNT(*) FROM ${table}`;
      let values = [];

      if (attribute && value !== undefined) {
        query += ` WHERE ${attribute} = $1`;
        values.push(value);
      }

      const data = await db.query(query, values);
      return parseInt(data.rows[0].count);
    } catch (e) {
      this.throwError(e.message);
    }
  }

  // =========================
  // FIND WITH LIMIT
  // =========================
  async findWithLimit({ table, limit = 10 }) {
    try {
      const query = `
        SELECT *
        FROM ${table}
        LIMIT $1;
      `;
      return await this.queryMany(query, [limit]);
    } catch (e) {
      this.throwError(e.message);
    }
  }

  // =========================
  // FIND WITH PAGINATION
  // =========================
  async findWithPagination({ table, limit = 10, offset = 0 }) {
    try {
      const query = `
        SELECT *
        FROM ${table}
        LIMIT $1 OFFSET $2;
      `;
      return await this.queryMany(query, [limit, offset]);
    } catch (e) {
      this.throwError(e.message);
    }
  }
}

module.exports = new Database();