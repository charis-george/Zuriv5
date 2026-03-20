const express = require('express')
const router = express.Router()
const { getDb } = require('../database')
const { requireBusinessAuth } = require('../middleware/auth')
const { sendBusinessEmail } = require('../lib/notifications')

const supabase = getDb()

function toISODateTime(dateStr, timeStr) {
  // `type="date"` gives YYYY-MM-DD, `type="time"` gives HH:MM (24h). We parse as local server time.
  // If later you want strict timezone support, we can store timezone separately.
  if (!dateStr || !timeStr) return null
  const dt = new Date(`${dateStr}T${timeStr}:00`)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

router.post('/', async (req, res) => {
  try {
    const { businessId, customerName, customerPhone, partySize, reservationDate, reservationTime, notes } = req.body || {}

    if (!businessId) return res.status(400).json({ error: 'businessId is required' })
    if (!customerName || typeof customerName !== 'string') return res.status(400).json({ error: 'customerName is required' })
    if (!customerPhone || typeof customerPhone !== 'string') return res.status(400).json({ error: 'customerPhone is required' })

    const iso = toISODateTime(reservationDate, reservationTime)
    if (!iso) return res.status(400).json({ error: 'reservationDate + reservationTime are required' })

    const size = Math.max(1, Math.min(50, Number(partySize) || 1))

    // Ensure business exists (and get email for notifications)
    const { data: business } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('id', businessId)
      .single()

    if (!business) return res.status(404).json({ error: 'Business not found' })

    const payload = {
      business_id: businessId,
      customer_name: customerName.trim().slice(0, 200),
      customer_phone: customerPhone.trim().slice(0, 50),
      party_size: size,
      reserved_for: iso,
      notes: typeof notes === 'string' ? notes.trim().slice(0, 1000) : null,
      status: 'requested'
    }

    const { data: reservation, error } = await supabase
      .from('reservations')
      .insert(payload)
      .select()
      .single()

    if (error) {
      console.error('Create reservation error:', error)
      return res.status(500).json({ error: 'Failed to create reservation request' })
    }

    // Real-time notification to business dashboard
    const io = req.app.get('io')
    if (io) io.to(`business-${businessId}`).emit('new-reservation', reservation)

    // Email notification to business (best effort)
    const humanWhen = new Date(iso).toLocaleString()
    await sendBusinessEmail({
      businessId,
      subject: `New table reservation request (${humanWhen})`,
      text: [
        `You received a new reservation request:`,
        ``,
        `Customer: ${payload.customer_name}`,
        `Phone: ${payload.customer_phone}`,
        `Party size: ${payload.party_size}`,
        `When: ${humanWhen}`,
        payload.notes ? `Notes: ${payload.notes}` : null,
        ``,
        `Please confirm or cancel from your dashboard under Orders > Reservation requests.`
      ].filter(Boolean).join('\n')
    })

    res.json({ success: true, reservation })
  } catch (err) {
    console.error('Reservations POST error:', err)
    res.status(500).json({ error: 'Failed to create reservation request' })
  }
})

// Business dashboard view (requires business auth)
router.get('/business/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Get reservations error:', error)
      return res.status(500).json({ error: 'Database error' })
    }

    res.json(data || [])
  } catch (err) {
    console.error('Reservations GET error:', err)
    res.status(500).json({ error: 'Failed to fetch reservations' })
  }
})

// Business confirms/cancels a reservation
router.patch('/:reservationId/status', requireBusinessAuth, async (req, res) => {
  try {
    const { reservationId } = req.params
    const { status } = req.body || {}

    if (!['confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    const updateData = { status }
    if (status === 'confirmed') updateData.confirmed_at = new Date().toISOString()
    if (status === 'cancelled') updateData.cancelled_at = new Date().toISOString()

    const { data: reservation, error } = await supabase
      .from('reservations')
      .update(updateData)
      .eq('id', reservationId)
      .eq('business_id', req.businessId)
      .select()
      .single()

    if (error) {
      console.error('Update reservation status error:', error)
      return res.status(500).json({ error: 'Failed to update reservation' })
    }
    if (!reservation) return res.status(404).json({ error: 'Reservation not found' })

    const io = req.app.get('io')
    if (io) io.to(`business-${reservation.business_id}`).emit('reservation-updated', reservation)

    res.json({ success: true, reservation })
  } catch (err) {
    console.error('Reservations PATCH error:', err)
    res.status(500).json({ error: 'Failed to update reservation' })
  }
})

module.exports = router

