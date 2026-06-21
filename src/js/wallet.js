import { db } from "./database.js";
import { getCurrentUser } from "./auth.js";
export class WalletManager {
  constructor() {
    this.user = getCurrentUser();
  }
  getBalance() {
    return this.user?.balance || 0;
  }
  async addFunds(amount, paymentMethod = "cash") {
    if (!amount || amount < 1000) {
      throw new Error("Minimun 1000Kyats");
    }
    const newBalance = db.updateBalance(
      this.user.id,
      amount,
      `Deposite ${amount.toLocaleString()} Kyats (${paymentMethod})`,
    );
    
    this.user = getCurrentUser();
    return {
      success: true,
      balance: newBalance,
      message: ` Deposite Complete. Remain Balance ${newBalance.toLocaleString()} Kyats`,
    };
  }
  async withdrawFunds(amount) {
    if (!amount || amount < 1000) {
      throw new Error("Minimum 1000Kyats");
    }
    if (amount > this.getBalance()) {
      throw new Error("Insufficient Balance");
    }
    const newBalance = db.updateBalance(
      this.user.id,
      -amount,
      `Withdraw ${amount.toLocaleString()} Kyats`,
    );
    this.user = getCurrentUser();
    return {
      success: true,
      balance: newBalance,
      message: ` Withdraw Complete! Remain Balance ${newBalance.toLocaleString()} Kyats`,
    };
  }
  getTransactionHistory(limit = 50) {
    const transactions = db.getTransactionsByUser(this.user.id);
    return transactions.slice(0, limit);
  }
  async payForRide(rideId, amount) {
    if (amount > this.getBalance()) {
      throw new Error("Insufficient balance");
    }
    const newBalance = db.updateBalance(
      this.user.id,
      -amount,
      `Paid for ride request #${rideId}`,
    );
    this.user = getCurrentUser();
    return {
      success: true,
      balance: newBalance,
      message: ` paid Complete! Remain Balance ${newBalance.toLocaleString()} Kyats`,
    };
  }
  async receivePayment(amount, description) {
    const newBalance = db.updateBalance(this.user.id, amount, description);
    this.user = getCurrentUser();
    return {
      success: true,
      balance: newBalance,
      message: `Transition received! Remain Balance ${newBalance.toLocaleString()} Kyats`,
    };
  }
}
export const wallet = new WalletManager();
