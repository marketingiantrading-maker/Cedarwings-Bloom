import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BLOOM_BASE  = 'https://api.bloomaligner.fr'
const BLOOM_TOKEN = '2405cb1d3b6520787d35b03f8e586582437e6db0e77b1e3252b04fd7825c9e15'
const HEADERS     = { 'Authorization': `Bearer ${BLOOM_TOKEN}`, 'Content-Type': 'application/json' }
const SUPA_URL    = Deno.env.get('SUPABASE_URL')!
const SUPA_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function fetchAligners(caseId: string): Promise<any[]> {
  const res = await fetch(`${BLOOM_BASE}/api/integration/data_sync/cases/${caseId}/aligners`, { headers: HEADERS })
  if (!res.ok) return []
  const data = await res.json()
  return data.results || (Array.isArray(data) ? data : (data.aligners || data.data || []))
}

Deno.serve(async (req) => {
  const sb = createClient(SUPA_URL, SUPA_KEY)
  const url = new URL(req.url)
  const offset = parseInt(url.searchParams.get('offset') || '0')
  const limit  = parseInt(url.searchParams.get('limit')  || '50')

  try {
    // Get IDs of cases that already have aligner data
    const { data: hasDets } = await sb
      .from('bloom_aligner_details')
      .select('case_number')
    const hasSet = new Set((hasDets || []).map((r: any) => String(r.case_number)))

    // Get cases missing aligner data
    const { data: allCases } = await sb
      .from('bloom_cases')
      .select('case_id')
      .order('case_id', { ascending: false })

    const missing = (allCases || []).filter((c: any) => !hasSet.has(String(c.case_id)))
    const batch   = missing.slice(offset, offset + limit)

    console.log(`[aligners-full] total missing: ${missing.length}, batch offset=${offset} size=${batch.length}`)

    let saved = 0, fetched = 0, errors = 0

    for (const { case_id } of batch) {
      try {
        const als = await fetchAligners(String(case_id))
        fetched += als.length
        if (!als.length) continue
        await sb.from('bloom_aligner_details').delete().eq('case_number', String(case_id))
        await sb.from('bloom_aligner_details').insert(
          als.map((a: any, idx: number) => ({
            case_number:        String(case_id),
            order_id:           a.order_no || a.order_id || a.id || null,
            order_index:        idx,
            aligner_upper:      a.aligner_upper  != null ? Number(a.aligner_upper)  : null,
            aligner_lower:      a.aligner_lower  != null ? Number(a.aligner_lower)  : null,
            number_of_aligners: a.number_of_aligners != null ? String(a.number_of_aligners) : null,
            package_type:       a.package_type  || null,
            order_type:         a.order_type    || 'TreatmentPlan',
            updated_at:         a.updated_at    || null,
            status:             a.status        || null
          }))
        )
        saved++
      } catch(e: any) {
        errors++
        console.warn(`case ${case_id}: ${e.message}`)
      }
    }

    const nextOffset = offset + limit
    const done = batch.length < limit

    return new Response(JSON.stringify({
      success: true,
      total_missing: missing.length,
      batch_processed: batch.length,
      cases_with_aligners_saved: saved,
      aligner_records_fetched: fetched,
      errors,
      next_offset: done ? null : nextOffset,
      done
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch(err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
})
