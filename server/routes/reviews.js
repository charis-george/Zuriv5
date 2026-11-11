const express = require('express')
const router = express.Router()
const { getDb } = require('../database')
const { requireBusinessAuth } = require('../middleware/auth')

const supabase = getDb()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ORDER_REVIEW_SELECT = 'id, business_id, payment_status, customer_name, customer_email'

/**
 * PaymentDone historically passed Paystack refs (zuri_ps_*) as orderId.
 * Resolve UUID or paystack_payment_reference without querying uuid columns with non-UUIDs (22P02).
 */
async function resolveOrderForReview(rawId) {
  const id = String(rawId || '').trim()
  if (!id) return null
  if (UUID_RE.test(id)) {
    const { data } = await supabase.from('orders').select(ORDER_REVIEW_SELECT).eq('id', id).maybeSingle()
    return data || null
  }
  if (id.startsWith('zuri_ps_') || id.startsWith('T') || id.length > 12) {
    const { data } = await supabase
      .from('orders')
      .select(ORDER_REVIEW_SELECT)
      .eq('paystack_payment_reference', id)
      .maybeSingle()
    return data || null
  }
  return null
}

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
    const { orderId: rawOrderId } = req.params
    if (!rawOrderId) return res.status(400).json({ error: 'orderId is required' })

    const order = await resolveOrderForReview(rawOrderId)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    const orderId = order.id

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
      .maybeSingle()

    return res.json({
      exists: Boolean(review),
      review: review || null,
      businessName: business?.name || null,
      orderId
    })
  } catch (err) {
    console.error('Reviews GET error:', err)
    res.status(500).json({ error: 'Failed to fetch review' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { orderId: rawOrderId, rating, comment } = req.body || {}

    if (!rawOrderId) return res.status(400).json({ error: 'orderId is required' })
    const r = Number(rating)
    if (!Number.isInteger(r) || r < 1 || r > 5) return res.status(400).json({ error: 'rating must be an integer from 1 to 5' })

    const order = await resolveOrderForReview(rawOrderId)
    if (!order) return res.status(404).json({ error: 'Order not found' })
    const orderId = order.id
    if (order.payment_status !== 'paid') return res.status(400).json({ error: 'Payment not successful for this order' })

    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('order_id', orderId)
      .maybeSingle()

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
