import { defineConfig } from 'vite'
import { resolve } from 'path'
export default defineConfig({
  root: '.',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'src/pages/login.html'),
        register: resolve(__dirname, 'src/pages/register.html'),
        dashboard: resolve(__dirname, 'src/pages/dashboard.html'),
        findRide: resolve(__dirname, 'src/pages/find-ride.html'),
        offerRide: resolve(__dirname, 'src/pages/offer-ride.html'),
        myRides: resolve(__dirname, 'src/pages/my-rides.html'),
        wallet: resolve(__dirname, 'src/pages/wallet.html'),
        driverRegister: resolve(__dirname, 'src/pages/driver-register.html'),
        driverDashboard: resolve(__dirname, 'src/pages/driver-dashboard.html'),
        rideRequests: resolve(__dirname, 'src/pages/ride-requests.html')
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
})