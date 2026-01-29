import jwt from 'jsonwebtoken';
import { userDb } from '../database/db.js';

// Get JWT secret from environment or use default (for development)
const JWT_SECRET = process.env.JWT_SECRET || 'claude-ui-dev-secret-change-in-production';

// Optional API key middleware
const validateApiKey = (req, res, next) => {
  // Skip API key validation if not configured
  if (!process.env.API_KEY) {
    return next();
  }
  
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// JWT authentication middleware
const authenticateToken = async (req, res, next) => {
  // Platform mode:  use single database user
  if (process.env.VITE_IS_PLATFORM === 'true') {
    try {
      const user = userDb.getFirstUser();
      if (!user) {
        return res.status(500).json({ error: 'Platform mode: No user found in database' });
      }
      req.user = user;
      return next();
    } catch (error) {
      console.error('Platform mode error:', error);
      return res.status(500).json({ error: 'Platform mode: Failed to fetch user' });
    }
  }

  // Normal OSS JWT validation
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  const queryToken = req.query.token;
  const cookieToken = req.cookies?.auth_token;

  const tokens = [cookieToken, headerToken, queryToken].filter(Boolean);
  if (!tokens.length) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  let decoded = null;
  for (const candidate of tokens) {
    decoded = verifyToken(candidate);
    if (decoded) break;
  }

  if (!decoded) {
    console.error('Token verification error: Invalid token');
    return res.status(403).json({ error: 'Invalid token' });
  }

  // Verify user still exists and is active
  const user = userDb.getUserById(decoded.userId);
  if (!user) {
    return res.status(401).json({ error: 'Invalid token. User not found.' });
  }

  req.user = user;
  next();
};

// Generate JWT token (never expires)
const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user.id, 
      username: user.username 
    },
    JWT_SECRET
    // No expiration - token lasts forever
  );
};

// WebSocket authentication function
const authenticateWebSocket = (token) => {
  // Platform mode: bypass token validation, return first user
  if (process.env.VITE_IS_PLATFORM === 'true') {
    try {
      const user = userDb.getFirstUser();
      if (user) {
        return { userId: user.id, username: user.username };
      }
      return null;
    } catch (error) {
      console.error('Platform mode WebSocket error:', error);
      return null;
    }
  }

  // Normal OSS JWT validation
  const tokens = Array.isArray(token) ? token : [token];
  if (!tokens.filter(Boolean).length) {
    return null;
  }

  for (const candidate of tokens) {
    if (!candidate) continue;
    const decoded = verifyToken(candidate);
    if (decoded) {
      return decoded;
    }
  }

  console.error('WebSocket token verification error: Invalid token');
  return null;
};

export {
  validateApiKey,
  authenticateToken,
  generateToken,
  authenticateWebSocket,
  JWT_SECRET
};
