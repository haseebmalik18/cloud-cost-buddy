# CloudCost Buddy

A mobile application for real-time multi-cloud cost monitoring across AWS, Azure, and Google Cloud Platform.

## Features

### 📊 Multi-Cloud Cost Monitoring
- Real-time cost tracking across AWS, Azure, and GCP
- Unified dashboard with cross-cloud comparison
- Service-level breakdown and cost attribution
- Monthly spend forecasting with trend analysis

### 🔔 Smart Alerts & Notifications
- Budget threshold alerts (per cloud + global)
- Spike detection for unusual cost increases
- Daily/weekly cost summaries
- Push notifications

### 📱 Mobile Experience
- Native React Native mobile app
- Real-time cost data synchronization
- Secure OAuth integration with cloud providers
- Intuitive dashboard and charts

### 🔐 Security
- Read-only access to billing APIs
- OAuth 2.0 authentication for all cloud connections
- Encrypted credential storage
- Enterprise-grade security

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Mobile App    │    │   Backend API   │    │  Cloud APIs     │
│  (React Native) │◄──►│   (Node.js)     │◄──►│ AWS/Azure/GCP   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Cloud Provider Setup

### AWS Configuration
- Create IAM role with `AWSBillingReadOnlyAccess` policy
- Configure Cost Explorer API access
- Set up Budgets API permissions

### Azure Configuration
- Create Service Principal with Reader role
- Enable Cost Management API access
- Configure subscription billing access

### GCP Configuration
- Create Service Account with Billing Account Viewer role
- Enable Cloud Billing API
- Set up BigQuery billing export (optional)

## Technology Stack

### Backend
- Node.js with Express framework
- SQLite database with Sequelize ORM
- AWS SDK v3 for Cost Explorer
- Azure SDK for Cost Management
- Google Cloud SDK for Billing API

### Mobile
- React Native with Expo framework
- React Navigation for routing
- Axios for API communication
- React Native Paper for UI components

### Security
- Helmet.js for security headers
- Rate limiting and request validation
- Input sanitization and XSS protection
- CORS configuration

## Installation

### Backend
```bash
git clone https://github.com/your-username/cloud-cost-buddy.git
cd cloud-cost-buddy
npm install
npm run dev
```

### Mobile App
```bash
cd mobile
npm install
npm start
```

## License

MIT License