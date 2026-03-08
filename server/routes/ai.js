const express = require('express');
const router = express.Router();
const { getBusinessPlan, canAccessAIFeatures } = require('../lib/plans');
const { getAIContext, formatContextForPrompt } = require('../lib/ai-context');
const { askClaude } = require('../lib/claude');

const INSIGHT_TYPES = {
  sales_summary: 'Summarize sales performance and trends in plain language (last 7 and 30 days). Mention top sellers and peak times if data exists. Keep it concise and actionable. Use Naira (₦) for money.',
  menu_optimization: 'Suggest how to improve the menu: ordering of categories/items, which items to highlight or promote, pricing tips, and simple description improvements. Be specific to the menu data. Keep suggestions short and actionable.',
  opportunities: 'Based on the data, list 3–5 concrete opportunities to increase sales or efficiency (e.g. promote underperforming items, staff for peak hours, adjust pricing). Be brief and specific.',
  demand_tips: 'Give short, practical demand and operations tips: when to expect more orders, which items to prep more, and any simple forecasting hints. Use the peak hours and popular items data.',
  revenue_insights: 'Act as an AI Revenue Insights tool. Analyze best-selling items, detect slow-moving inventory (items that sell little or not at all), recommend specific price adjustments (with approximate amounts or percentages), and suggest 1–2 bundle or combo deals. Give one concrete example insight like "Your Chicken Shawarma sells 42% more on Fridays—consider a combo deal." Use Naira (₦). Be concise and actionable.',
  sales_forecasting: 'Act as an AI Sales Forecasting tool. Predict demand for the next week: expected sales level, peak hours, predicted busy days, and recommended staffing levels. Give one concrete example like "Expected traffic increase Saturday 6–9 PM (+35%)." Restaurants and event venues rely on this. Use the sales and peak-hours data. Be concise.',
  storefront_optimization: 'Act as a Smart Menu/Storefront advisor. Suggest how to arrange the menu to increase order value: highlight profitable items, move high-margin items to the top, suggest 1–2 auto-bundles. Be specific to their menu and margins. One short paragraph.',
  customer_intelligence: 'Summarize who their customers are based on the data: repeat customer rate, average spend, visit frequency, and one insight like "32% of customers return within 10 days." This helps decision-making. Use Naira (₦). Be concise.',
  promotions_suggestions: 'Act as an Automated Promotions advisor. Suggest 2–3 specific promotions: e.g. happy hour, slow-day discount (e.g. Tuesday), or buy-2-get-1 deal. Base suggestions on their peak hours and slow items. Tell them they can schedule these in Zuri. Be brief.',
  custom: 'Answer the question using only the business data provided. Be concise and actionable. If the data does not support an answer, say so. Use Naira (₦) for money.'
};

router.post('/insights', async (req, res) => {
  try {
    const { businessId, type, query } = req.body;
    if (!businessId || !type) {
      return res.status(400).json({ error: 'businessId and type are required' });
    }
    const plan = await getBusinessPlan(businessId);
    if (!canAccessAIFeatures(plan)) {
      return res.status(403).json({
        error: 'AI insights are available on Pro plan and above. Upgrade to unlock.',
        upgradeRequired: true
      });
    }

    const promptInstruction = INSIGHT_TYPES[type];
    if (!promptInstruction) {
      return res.status(400).json({ error: 'Invalid type. Use: sales_summary, menu_optimization, opportunities, demand_tips, revenue_insights, sales_forecasting, storefront_optimization, customer_intelligence, promotions_suggestions, or custom.' });
    }
    if (type === 'custom' && !query) {
      return res.status(400).json({ error: 'query is required when type is custom' });
    }

    const context = await getAIContext(businessId, plan);
    const contextText = formatContextForPrompt(context);

    const systemPrompt = `You are an expert business advisor for a restaurant/food business using the Zuri ordering platform. Use only the following business data to give advice. Be concise and actionable. Use Naira (₦) for currency.`;
    const userMessage = type === 'custom'
      ? `Business data:\n${contextText}\n\nQuestion: ${query}`
      : `Business data:\n${contextText}\n\nTask: ${promptInstruction}`;

    const insight = await askClaude(systemPrompt, userMessage);
    if (insight == null) {
      return res.status(503).json({
        error: 'AI service is temporarily unavailable. Please try again later.',
        insight: null
      });
    }

    res.json({ insight });
  } catch (error) {
    console.error('AI insights error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
