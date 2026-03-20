const express = require('express')
const router = express.Router()
const { getDb } = require('../database')
const { requireBusinessAuth } = require('../middleware/auth')

const supabase = getDb()

router.get('/business/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('List reviews error:', error)
      return res.status(500).json({ error: 'Failed to load reviews' })
    }
    res.json({ reviews: data || [] })
  } catch (err) {
    console.error('Reviews list error:', err)
    res.status(500).json({ error: 'Failed to load reviews' })
  }
})

router.get('/for-order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params
    if (!orderId) return res.status(400).json({ error: 'orderId is required' })

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, business_id, payment_status, customer_name, customer_email')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) return res.status(404).json({ error: 'Order not found' })

    const { data: business } = await supabase
      .from('businesses')
      .select('name')
      .eq('id', order.business_id)
      .single()

    // If payment wasn't successful, don't show review prompt eligibility.
    if (order.payment_status !== 'paid') {
      return res.json({ exists: false, review: null, businessName: business?.name || null })
    }

    const { data: review } = await supabase
      .from('reviews')
      .select('*')
      .eq('order_id', orderId)
      .single()

    return res.json({
      exists: Boolean(review),
      review: review || null,
      businessName: business?.name || null
    })
  } catch (err) {
    console.error('Reviews GET error:', err)
    res.status(500).json({ error: 'Failed to fetch review' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { orderId, rating, comment } = req.body || {}

    if (!orderId) return res.status(400).json({ error: 'orderId is required' })
    const r = Number(rating)
    if (!Number.isInteger(r) || r < 1 || r > 5) return res.status(400).json({ error: 'rating must be an integer from 1 to 5' })

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, business_id, payment_status, customer_name, customer_email')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) return res.status(404).json({ error: 'Order not found' })
    if (order.payment_status !== 'paid') return res.status(400).json({ error: 'Payment not successful for this order' })

    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('order_id', orderId)
      .single()

    if (existing?.id) {
      return res.status(409).json({ error: 'Review already submitted for this order' })
    }

    const payload = {
      business_id: order.business_id,
      order_id: orderId,
      customer_name: order.customer_name || null,
      customer_email: order.customer_email || null,
      rating: r,
      comment: typeof comment === 'string' ? comment.trim().slice(0, 2000) : null
    }

    const { data: review, error } = await supabase
      .from('reviews')
      .insert(payload)
      .select()
      .single()

    if (error) {
      // Unique constraint protection: if two requests race, return a friendly error.
      if (String(error.message || '').toLowerCase().includes('unique')) {
        return res.status(409).json({ error: 'Review already submitted for this order' })
      }
      console.error('Create review error:', error)
      return res.status(500).json({ error: 'Failed to submit review' })
    }

    try {
      const io = req.app && req.app.get ? req.app.get('io') : null
      if (io && review) {
        io.to(`business-${order.business_id}`).emit('new-review', {
          review: {
            id: review.id,
            business_id: review.business_id,
            order_id: review.order_id,
            customer_name: review.customer_name,
            customer_email: review.customer_email,
            rating: review.rating,
            comment: review.comment,
            created_at: review.created_at
          }
        })
      }
    } catch (e) {
      console.error('Review socket emit error:', e)
    }

    res.json({ success: true, review })
  } catch (err) {
    console.error('Reviews POST error:', err)
    res.status(500).json({ error: 'Failed to submit review' })
  }
})

module.exports = router

