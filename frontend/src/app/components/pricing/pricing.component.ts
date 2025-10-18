import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

interface PricingPlan {
  tier: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  badge?: string;
  color: string;
  features: Array<{
    text: string;
    included: boolean;
    highlight?: boolean;
  }>;
  cta: string;
}

@Component({
  selector: 'app-pricing',
  templateUrl: './pricing.component.html',
  styleUrls: ['./pricing.component.scss']
})
export class PricingComponent implements OnInit {
  billingCycle: 'monthly' | 'annual' = 'monthly';
  
  plans: PricingPlan[] = [
    {
      tier: 'basic',
      name: 'Basic',
      monthlyPrice: 19,
      annualPrice: 15,
      color: '#9a9a9a',
      features: [
        { text: '50 trades/month tracking', included: true },
        { text: '5 favorite stocks', included: true },
        { text: '10 EMA analyses/month', included: true },
        { text: 'Trade tracker (full access)', included: true },
        { text: '1 year historical data', included: true },
        { text: 'Mean reversion alerts', included: true },
        { text: 'Performance dashboard', included: true },
        { text: 'MA Optimization', included: false },
        { text: 'Top Performers', included: false },
        { text: 'Data export', included: false },
        { text: 'Email support', included: false }
      ],
      cta: 'Start Free Trial'
    },
    {
      tier: 'plus',
      name: 'Plus',
      monthlyPrice: 49,
      annualPrice: 39,
      badge: 'Most Popular',
      color: '#51cbce',
      features: [
        { text: '200 trades/month tracking', included: true },
        { text: '20 favorite stocks', included: true },
        { text: '50 EMA analyses/month', included: true },
        { text: 'Trade tracker (full access)', included: true },
        { text: '2 years historical data', included: true },
        { text: 'All signals & alerts', included: true },
        { text: 'Top Performers (top 100)', included: true, highlight: true },
        { text: '5 MA optimizations/month', included: true, highlight: true },
        { text: 'CSV export', included: true },
        { text: 'Email support', included: true },
        { text: 'Stock symbol management', included: false }
      ],
      cta: 'Start Free Trial'
    },
    {
      tier: 'pro',
      name: 'Pro',
      monthlyPrice: 99,
      annualPrice: 79,
      color: '#fbc658',
      features: [
        { text: 'Unlimited trades tracking', included: true, highlight: true },
        { text: 'Unlimited favorite stocks', included: true },
        { text: 'Unlimited EMA analyses', included: true },
        { text: 'Trade tracker (full access)', included: true },
        { text: '3 years historical data', included: true },
        { text: 'All signals & alerts + email', included: true, highlight: true },
        { text: 'Top Performers (full access)', included: true, highlight: true },
        { text: 'Unlimited MA optimizations', included: true, highlight: true },
        { text: 'Stock symbol management', included: true },
        { text: 'CSV export + API access', included: true },
        { text: 'Priority support', included: true }
      ],
      cta: 'Start Free Trial'
    }
  ];

  constructor(private router: Router) {}

  ngOnInit(): void {}

  toggleBillingCycle(): void {
    this.billingCycle = this.billingCycle === 'monthly' ? 'annual' : 'monthly';
  }

  getPrice(plan: PricingPlan): number {
    return this.billingCycle === 'monthly' ? plan.monthlyPrice : plan.annualPrice;
  }

  getSavings(plan: PricingPlan): number {
    const monthlyCost = plan.monthlyPrice * 12;
    const annualCost = plan.annualPrice * 12;
    return monthlyCost - annualCost;
  }

  getSavingsPercent(plan: PricingPlan): number {
    const monthlyCost = plan.monthlyPrice * 12;
    const annualCost = plan.annualPrice * 12;
    return Math.round(((monthlyCost - annualCost) / monthlyCost) * 100);
  }

  selectPlan(tier: string): void {
    // Navigate to registration with plan parameter
    this.router.navigate(['/register'], { queryParams: { plan: tier } });
  }
}
