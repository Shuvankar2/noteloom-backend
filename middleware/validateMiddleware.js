/**
 * NoteLoom Request Validation Middleware (Zod)
 */
const validate = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params
    });

    // Replace with validated and sanitized data (strips out any unknown keys)
    req.body = parsed.body || {};
    req.query = parsed.query || {};
    req.params = parsed.params || {};

    next();
  } catch (error) {
    if (error.name === 'ZodError') {
      const issues = error.issues || error.errors || [];
      const details = issues.map(err => ({
        field: err.path.join('.').replace(/^(body|query|params)\./, ''),
        message: err.message
      }));
      return res.status(400).json({ error: "Validation failed", details });
    }
    return res.status(500).json({ error: "Validation internal error" });
  }
};

module.exports = validate;
