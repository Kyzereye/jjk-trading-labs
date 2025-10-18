# JJK Trading Labs - Subscription Pricing Plan

## 🎯 Overview
Three-tier subscription model designed for individual traders to professional investors.

## ⏱️ Free Trial
- **Duration**: 7 days
- **Tier**: Full Pro access (show them everything!)
- **Strategy**: Let users experience all premium features, then convert to paid tier

### Trial Conversion Emails:
- Day 3: "Have you tried MA Optimization?"
- Day 5: "Your trial ends in 2 days - here's what you'll keep with Plus"
- Day 7: "Last day! Upgrade to keep Pro features"

---

## 💰 Subscription Tiers

### 🥉 Basic - $19/mo ($15/mo annual)
**Target**: Individual traders starting out

**Features:**
- ✅ 50 trades/month tracking
- ✅ 5 favorite stocks
- ✅ 10 EMA analyses/month
- ✅ Trade tracker (full access)
- ✅ 1 year historical data
- ✅ Mean reversion alerts
- ✅ Performance dashboard
- ❌ MA Optimization
- ❌ Top Performers
- ❌ Data export

**Value Proposition**: "Start tracking your trades professionally"

---

### 🥈 Plus - $49/mo ($39/mo annual) 
**Target**: Active traders managing multiple positions
**Badge**: "Most Popular"

**Features:**
- ✅ 200 trades/month tracking
- ✅ 20 favorite stocks
- ✅ 50 EMA analyses/month
- ✅ Trade tracker (full access)
- ✅ 2 years historical data
- ✅ All signals & alerts
- ✅ Top Performers (view top 100)
- ✅ 5 MA optimizations/month
- ✅ CSV export
- ✅ Email support

**Value Proposition**: "Optimize your trading strategy with data-driven insights"

---

### 🥇 Pro - $99/mo ($79/mo annual)
**Target**: Serious traders & professionals

**Features:**
- ✅ Unlimited trades tracking
- ✅ Unlimited favorite stocks
- ✅ Unlimited EMA analyses
- ✅ Trade tracker (full access)
- ✅ 3 years historical data
- ✅ All signals & alerts + email notifications
- ✅ Top Performers (full access, all filters)
- ✅ Unlimited MA optimizations + batch mode
- ✅ Stock symbol management
- ✅ CSV export + API access (future)
- ✅ Priority support
- ✅ Early access to new features

**Value Proposition**: "Professional-grade trading analytics platform"

---

## 📈 Pricing Strategy

### **Psychological Pricing:**
- $19 = "Cheap" (impulse buy, low commitment)
- $49 = "Value" (serious tool for active traders)
- $99 = "Professional" (investment in trading success)

### **Annual Discount:**
- ~20% discount encourages yearly commitment
- Improves cash flow
- Reduces churn

### **Growth Path:**
```
Free Trial (7 days Pro)
    ↓
Basic ($19/mo) - Learn the platform
    ↓
Plus ($49/mo) - Get serious about optimization
    ↓
Pro ($99/mo) - Run trading like a business
```

---

## 🔒 Feature Gates (Implementation)

### **Database Schema:**
```sql
ALTER TABLE user_preferences ADD COLUMN subscription_tier VARCHAR(20) DEFAULT 'basic';
ALTER TABLE user_preferences ADD COLUMN trial_ends_at DATETIME NULL;
ALTER TABLE user_preferences ADD COLUMN subscription_status ENUM('trial', 'active', 'cancelled', 'expired') DEFAULT 'trial';
```

### **Usage Tracking:**
Create new table for monthly quotas:
```sql
CREATE TABLE user_usage (
  user_id INT,
  month DATE,
  trades_count INT DEFAULT 0,
  ema_analyses_count INT DEFAULT 0,
  ma_optimizations_count INT DEFAULT 0,
  PRIMARY KEY (user_id, month)
);
```

### **Feature Check Middleware:**
```typescript
// Check if user can access feature based on tier
- Basic: favorites <= 5, trades <= 50/mo, analyses <= 10/mo
- Plus: favorites <= 20, trades <= 200/mo, analyses <= 50/mo, optimizations <= 5/mo
- Pro: unlimited everything
```

---

## 🎨 Pricing Page Design

### **Layout:**
```
Header: "Choose Your Plan" + subtitle
Toggle: [Monthly] / [Annual] (show savings)

[Basic Card] | [Plus Card - BADGE: Most Popular] | [Pro Card]

Each card:
- Price (with annual savings shown)
- Feature list with checkmarks/crosses
- "Start Free Trial" or "Choose Plan" button
- Small print: "7-day Pro trial included"

FAQ section below
```

### **Colors:**
- Basic: Default theme (#9a9a9a)
- Plus: Accent blue (#51cbce) - highlight
- Pro: Gold (#fbc658)

---

## 🚀 Future Expansion Ideas

### **Enterprise Tier** (Future - $299/mo):
- Team accounts (5 users)
- Shared watchlists
- Team performance analytics
- White-label options
- Dedicated account manager

### **Add-ons** (Future):
- Extra MA optimizations: $10 for 10
- Historical data extension: $5/mo for 5 years
- Priority data updates: $15/mo (hourly instead of daily)
- SMS alerts: $10/mo

---

## 💡 Marketing Angles

### **Basic:**
"Perfect for tracking your real trades and seeing how the algorithm performs on your favorite stocks"

### **Plus:**
"Everything in Basic, PLUS optimize your MA parameters and see which stocks the algorithm performs best on"

### **Pro:**
"The complete professional trading analytics platform. Unlimited everything."

---

## 📊 Revenue Projections

### **Conservative Launch (Year 1):**
```
Month 6:
- 100 trial users
- 30% convert to paid (30 users)
  - 15 Basic ($19) = $285/mo
  - 10 Plus ($49) = $490/mo
  - 5 Pro ($99) = $495/mo
Total: ~$1,270/mo = $15,240/year

Month 12:
- 500 trial users
- 30% convert to paid (150 users)
  - 60 Basic = $1,140/mo
  - 60 Plus = $2,940/mo
  - 30 Pro = $2,970/mo
Total: ~$7,050/mo = $84,600/year
```

### **With Annual Subscriptions:**
If 50% choose annual, you get 12 months revenue upfront → Better cash flow!

---

*Last Updated: October 18, 2025*

