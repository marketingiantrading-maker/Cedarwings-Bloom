import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BLOOM_BASE  = 'https://api.bloomaligner.fr'
const BLOOM_TOKEN = '2405cb1d3b6520787d35b03f8e586582437e6db0e77b1e3252b04fd7825c9e15'
const HEADERS     = { 'Authorization': `Bearer ${BLOOM_TOKEN}`, 'Content-Type': 'application/json' }
const SUPA_URL    = Deno.env.get('SUPABASE_URL')!
const SUPA_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const sb = createClient(SUPA_URL, SUPA_KEY)
  const url = new URL(req.url)
  const offset = parseInt(url.searchParams.get('offset') || '0')
  const limit  = parseInt(url.searchParams.get('limit')  || '50')

  try {
    const { data: allCases, error: cErr } = await sb
      .from('bloom_cases').select('case_id').order('case_id', { ascending: true })
    if (cErr) throw new Error('bloom_cases read: ' + cErr.message)

    const { data: hasDets, error: hErr } = await sb
      .from('bloom_aligner_details').select('case_number')
    if (hErr) throw new Error('bloom_aligner_details read: ' + hErr.message)

    const hasSet = new Set((hasDets || []).map((r:any) => String(r.case_number)))
    const missing = (allCases || []).filter((c:any) => !hasSet.has(String(c.case_id)))
    const batch = missing.slice(offset, offset + limit)

    let saved = 0, fetched = 0, errors = 0, errDetails: string[] = []

    for (const { case_id } of batch) {
      try {
        const res = await fetch(`${BLOOM_BASE}/api/integration/data_sync/cases/${case_id}/aligners`, { headers: HEADERS })
        if (!res.ok) { errors++; continue }
        const data = await res.json()
        const als = data.results || (Array.isArray(data) ? data : (data.aligners || []))
        fetched += als.length
        if (!als.length) continue

        const rows = als.map((a:any, idx:number) => ({
          case_number:        String(case_id),
          order_id:           String(a.order_no || a.order_id || a.id || ''),
          order_index:        idx,
          aligner_upper:      a.aligner_upper !== '' && a.aligner_upper != null ? Number(a.aligner_upper) : null,
          aligner_lower:      a.aligner_lower !== '' && a.aligner_lower != null ? Number(a.aligner_lower) : null,
          number_of_aligners: a.number_of_aligners != null ? String(a.number_of_aligners) : null,
          package_type:       a.package_type || null,
          order_type:         a.order_type || 'TreatmentPlan',
          status:             a.status || null,
          updated_at:         a.updated_at || null,
        }))

        const { error: iErr } = await sb.from('bloom_aligner_details').insert(rows)
        if (iErr) { errors++; errDetails.push(`${case_id}: ${iErr.message}`); continue }
        saved++
      } catch(e:any) { errors++; errDetails.push(`${case_id}: ${e.message}`) }
    }

    return new Response(JSON.stringify({
      success: true,
      total_cases: (allCases||[]).length,
      total_missing: missing.length,
      batch_size: batch.length,
      cases_saved: saved,
      records_fetched: fetched,
      errors,
      error_details: errDetails.slice(0,5),
      next_offset: offset + limit,
      done: batch.length < limit
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch(err:any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
})
