import { db } from './database.js';
export function login(identifier, password) {
  try {
    const user = db.loginUser(identifier, password);
    return { success: true, user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
export function register(name, email, phone, password) {
  try {
    const user = db.registerUser({
      name,
      email,
      phone,
      password,
      balance: 0
    });
    return { success: true, user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
export function logout() {
  db.logoutUser();
  window.location.href = '/';
}
export function isLoggedIn() {
  return db.getCurrentUser() !== null;
}
export function getCurrentUser() {
  return db.getCurrentUser();
}
export function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/src/pages/login.html';
    return false;
  }
  return true;
}