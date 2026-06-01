import { db } from './database.js';
import { getCurrentUser } from './auth.js';
export class WalletManager {
  constructor() {
    this.user = getCurrentUser();
  }
  getBalance() {
    return this.user?.balance || 0;
  }
  async addFunds(amount, paymentMethod = 'cash') {
    if (!amount || amount < 1000) {
      throw new Error('အနည်းဆုံး 1,000 ကျပ် ဖြည့်သွင်းပါ');
    }
    const newBalance = db.updateBalance(
      this.user.id, 
      amount, 
      `ငွေသွင်း ${amount.toLocaleString()} ကျပ် (${paymentMethod})`
    );
    // Refresh user data
    this.user = getCurrentUser();
    return {
      success: true,
      balance: newBalance,
      message: `✅ ငွေသွင်းပြီးပါပြီ။ လက်ကျန်ငွေ ${newBalance.toLocaleString()} ကျပ်`
    };
  }
  async withdrawFunds(amount) {
    if (!amount || amount < 1000) {
      throw new Error('အနည်းဆုံး 1,000 ကျပ် ထုတ်ယူပါ');
    }
    if (amount > this.getBalance()) {
      throw new Error('လက်ကျန်ငွေ မလုံလောက်ပါ');
    }
    const newBalance = db.updateBalance(
      this.user.id,
      -amount,
      `ငွေထုတ် ${amount.toLocaleString()} ကျပ်`
    );
    this.user = getCurrentUser();
    return {
      success: true,
      balance: newBalance,
      message: `✅ ငွေထုတ်ပြီးပါပြီ။ လက်ကျန်ငွေ ${newBalance.toLocaleString()} ကျပ်`
    };
  }
  getTransactionHistory(limit = 50) {
    const transactions = db.getTransactionsByUser(this.user.id);
    return transactions.slice(0, limit);
  }
  async payForRide(rideId, amount) {
    if (amount > this.getBalance()) {
      throw new Error('လက်ကျန်ငွေ မလုံလောက်ပါ');
    }
    const newBalance = db.updateBalance(
      this.user.id,
      -amount,
      `ခရီးစဉ်အတွက် ပေးချေမှု #${rideId}`
    );
    this.user = getCurrentUser();
    return {
      success: true,
      balance: newBalance,
      message: `✅ ငွေပေးချေပြီးပါပြီ။ လက်ကျန်ငွေ ${newBalance.toLocaleString()} ကျပ်`
    };
  }
  async receivePayment(amount, description) {
    const newBalance = db.updateBalance(
      this.user.id,
      amount,
      description
    );
    this.user = getCurrentUser();
    return {
      success: true,
      balance: newBalance,
      message: `✅ ငွေလက်ခံရရှိပါပြီ။ လက်ကျန်ငွေ ${newBalance.toLocaleString()} ကျပ်`
    };
  }
}
export const wallet = new WalletManager();