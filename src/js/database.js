// Database Manager - Handles all localStorage operations
class DatabaseManager {
  constructor() {
    this.initDatabase();
  }
  initDatabase() {
    if (!localStorage.getItem('smartride_users')) {
      // Sample data for demo
      const sampleUsers = [
        {
          id: this.generateId(),
          name: "Demo Passenger",
          email: "passenger@demo.com",
          password: "123456",
          phone: "09123456789",
          balance: 50000,
          userType: "passenger",
          createdAt: new Date().toISOString()
        },
        {
          id: this.generateId(),
          name: "Demo Driver", 
          email: "driver@demo.com",
          password: "123456",
          phone: "09987654321",
          balance: 150000,
          userType: "driver",
          createdAt: new Date().toISOString()
        }
      ];
      localStorage.setItem('smartride_users', JSON.stringify(sampleUsers));
      localStorage.setItem('smartride_drivers', JSON.stringify([]));
      localStorage.setItem('smartride_rides', JSON.stringify([]));
      localStorage.setItem('smartride_bookings', JSON.stringify([]));
      localStorage.setItem('smartride_transactions', JSON.stringify([]));
    }
  }
  generateId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }
  // User methods
  getUsers() {
    return JSON.parse(localStorage.getItem('smartride_users')) || [];
  }
  saveUsers(users) {
    localStorage.setItem('smartride_users', JSON.stringify(users));
  }
  registerUser(userData) {
    const users = this.getUsers();
    const existingUser = users.find(u => u.email === userData.email);
    if (existingUser) throw new Error('Email already exists');
    const newUser = {
      id: this.generateId(),
      ...userData,
      balance: 0,
      userType: 'passenger',
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    this.saveUsers(users);
    return newUser;
  }
  loginUser(email, password) {
    const users = this.getUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) throw new Error('Invalid credentials');
    localStorage.setItem('smartride_currentUser', JSON.stringify(user));
    return user;
  }
  logoutUser() {
    localStorage.removeItem('smartride_currentUser');
  }
  getCurrentUser() {
    return JSON.parse(localStorage.getItem('smartride_currentUser'));
  }
  updateUser(updatedUser) {
    const users = this.getUsers();
    const index = users.findIndex(u => u.id === updatedUser.id);
    if (index !== -1) {
      users[index] = updatedUser;
      this.saveUsers(users);
      localStorage.setItem('smartride_currentUser', JSON.stringify(updatedUser));
    }
  }
  // Driver methods
  getDrivers() {
    return JSON.parse(localStorage.getItem('smartride_drivers')) || [];
  }
  saveDrivers(drivers) {
    localStorage.setItem('smartride_drivers', JSON.stringify(drivers));
  }
  registerDriver(driverData) {
    const drivers = this.getDrivers();
    const newDriver = {
      id: this.generateId(),
      ...driverData,
      isVerified: true,
      rating: 5.0,
      totalRides: 0,
      createdAt: new Date().toISOString()
    };
    drivers.push(newDriver);
    this.saveDrivers(drivers);
    // Update user type
    const currentUser = this.getCurrentUser();
    if (currentUser) {
      currentUser.userType = 'driver';
      currentUser.driverId = newDriver.id;
      this.updateUser(currentUser);
    }
    return newDriver;
  }
  getDriverByUserId(userId) {
    const drivers = this.getDrivers();
    return drivers.find(d => d.userId === userId);
  }
  // Ride methods
  getRides() {
    return JSON.parse(localStorage.getItem('smartride_rides')) || [];
  }
  saveRides(rides) {
    localStorage.setItem('smartride_rides', JSON.stringify(rides));
  }
  offerRide(rideData) {
    const rides = this.getRides();
    const newRide = {
      id: this.generateId(),
      ...rideData,
      status: 'scheduled',
      bookedSeats: 0,
      passengers: [],
      createdAt: new Date().toISOString()
    };
    rides.push(newRide);
    this.saveRides(rides);
    return newRide;
  }
  getRidesByDriver(driverId) {
    const rides = this.getRides();
    return rides.filter(r => r.driverId === driverId);
  }
  getRidesByPassenger(passengerId) {
    const bookings = this.getBookingsByPassenger(passengerId);
    const rides = this.getRides();
    return bookings.map(booking => rides.find(r => r.id === booking.rideId)).filter(r => r);
  }
  // Booking methods
  getBookings() {
    return JSON.parse(localStorage.getItem('smartride_bookings')) || [];
  }
  saveBookings(bookings) {
    localStorage.setItem('smartride_bookings', JSON.stringify(bookings));
  }
  createBooking(rideId, passengerId, seats, totalPrice) {
    const bookings = this.getBookings();
    const newBooking = {
      id: this.generateId(),
      rideId,
      passengerId,
      seats,
      totalPrice,
      status: 'confirmed',
      bookingTime: new Date().toISOString()
    };
    bookings.push(newBooking);
    this.saveBookings(bookings);
    // Update ride booked seats
    const rides = this.getRides();
    const ride = rides.find(r => r.id === rideId);
    if (ride) {
      ride.bookedSeats = (ride.bookedSeats || 0) + seats;
      this.saveRides(rides);
    }
    // Deduct from wallet
    this.updateBalance(passengerId, -totalPrice, `Ride booking: ${rideId}`);
    return newBooking;
  }
  getBookingsByPassenger(passengerId) {
    const bookings = this.getBookings();
    return bookings.filter(b => b.passengerId === passengerId);
  }
  // Transaction methods
  getTransactions() {
    return JSON.parse(localStorage.getItem('smartride_transactions')) || [];
  }
  saveTransactions(transactions) {
    localStorage.setItem('smartride_transactions', JSON.stringify(transactions));
  }
  updateBalance(userId, amount, description) {
    const users = this.getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) throw new Error('User not found');
    users[userIndex].balance += amount;
    this.saveUsers(users);
    // Record transaction
    const transactions = this.getTransactions();
    transactions.push({
      id: this.generateId(),
      userId: userId,
      amount: amount,
      type: amount > 0 ? 'credit' : 'debit',
      description: description,
      balance: users[userIndex].balance,
      createdAt: new Date().toISOString()
    });
    this.saveTransactions(transactions);
    // Update current user if needed
    const currentUser = this.getCurrentUser();
    if (currentUser && currentUser.id === userId) {
      currentUser.balance = users[userIndex].balance;
      localStorage.setItem('smartride_currentUser', JSON.stringify(currentUser));
    }
    return users[userIndex].balance;
  }
  getTransactionsByUser(userId) {
    const transactions = this.getTransactions();
    return transactions.filter(t => t.userId === userId).reverse();
  }
  // AI Matching Algorithm
  findMatchingRides(startLocation, endLocation, departureTime) {
    const rides = this.getRides();
    const currentUser = this.getCurrentUser();
    const currentDriverId = currentUser?.driverId;
    // Filter available rides
    const availableRides = rides.filter(ride => {
      return ride.status === 'scheduled' && 
             ride.bookedSeats < 4 &&
             ride.driverId !== currentDriverId;
    });
    // Score each ride for matching
    const scoredRides = availableRides.map(ride => {
      let score = 0;
      // Simple location matching (case insensitive)
      if (ride.startLocation?.toLowerCase().includes(startLocation.toLowerCase())) score += 40;
      if (ride.endLocation?.toLowerCase().includes(endLocation.toLowerCase())) score += 40;
      // Time match (within 1 hour)
      if (ride.departureTime) {
        const rideHour = new Date(ride.departureTime).getHours();
        const requestHour = new Date(departureTime).getHours();
        if (Math.abs(rideHour - requestHour) <= 1) score += 20;
      }
      return { ride, score };
    });
    // Sort by score and return top matches
    scoredRides.sort((a, b) => b.score - a.score);
    // Calculate dynamic pricing
    return scoredRides.slice(0, 3).map(match => {
      const basePrice = 7500;
      const currentPassengers = match.ride.bookedSeats || 0;
      const totalPassengers = currentPassengers + 1;
      const discountedPrice = Math.floor(basePrice / (totalPassengers + 1));
      return {
        ...match.ride,
        matchScore: match.score,
        originalPrice: basePrice,
        discountedPrice: discountedPrice,
        savings: basePrice - discountedPrice,
        totalPassengers: totalPassengers
      };
    }).filter(m => m.matchScore > 0);
  }
}
// Export singleton instance
export const db = new DatabaseManager();