import test from 'node:test'
import assert from 'node:assert/strict'
import { NVIDIA_MODEL, validateReasoning, checkReviewBudget, loadDecisionModule, reviewDecision } from './nemotronDecision.js'
const feedback = { strength:'You connected the choice to a learning constraint.', risk:'You may skip a prerequisite.', experiment:'Inspect one request and identify its method.', question:'What observation would change your choice?' }
test('loads the actual CLI curriculum and rejects path traversal', async () => {
  const module = await loadDecisionModule('system-design-fundamentals','http-basics')
  assert.equal(module.title,'How the Web Works')
  await assert.rejects(loadDecisionModule('../private','file'), { status:409 })
})
test('requires a bounded learner explanation', () => {
  assert.throws(()=>validateReasoning('short'),{status:400})
  assert.throws(()=>validateReasoning('x'.repeat(2001)),{status:400})
})
test('enforces learner, global and cooldown limits', () => {
  assert.throws(()=>checkReviewBudget({total:3,mine:3}),{status:429})
  assert.throws(()=>checkReviewBudget({total:20,mine:0}),{status:429})
  assert.throws(()=>checkReviewBudget({total:1,mine:1,secondsSinceLast:30}),{status:429,retryAfter:30})
  assert.doesNotThrow(()=>checkReviewBudget({total:2,mine:2,secondsSinceLast:61}))
})
test('uses NVIDIA with only the current decision exercise and validates structured feedback', async () => {
  const module = await loadDecisionModule('system-design-fundamentals','http-basics')
  const result = await reviewDecision({module,reasoning:'I would learn by building a small server first, then inspect each request so I can connect concepts to observations.',key:'test-key',fetchImpl:async(url, options)=>{
    assert.equal(url,'https://integrate.api.nvidia.com/v1/chat/completions')
    const body=JSON.parse(options.body)
    assert.equal(body.model,NVIDIA_MODEL)
    assert.equal(body.max_tokens,1200)
    assert.equal(body.chat_template_kwargs.enable_thinking,false)
    const context=JSON.parse(body.messages[1].content)
    assert.deepEqual(context.decisionExercise,module.steps.DECIDE)
    assert.equal(context.profile,undefined)
    assert.equal(context.token,undefined)
    assert.equal(context.BUILD,undefined)
    return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(feedback)}}]})}
  }})
  assert.deepEqual(result.review,feedback)
  assert.equal(result.provider,'NVIDIA')
})
test('does not expose upstream errors or substitute another provider', async () => {
  await assert.rejects(reviewDecision({module:{title:'Test',steps:{DECIDE:{}}},reasoning:'A sufficient explanation to check the unavailable provider response.',key:'test-key',fetchImpl:async()=>({ok:false,status:401,text:async()=>'private upstream response'})}), error=>error.status===503&&!error.message.includes('private upstream'))
})
test('rejects incomplete or truncated reviews', async () => {
  for (const choice of [{finish_reason:'length',message:{content:JSON.stringify(feedback)}},{finish_reason:'stop',message:{content:'{"strength":"only one field"}'}}]) {
    await assert.rejects(reviewDecision({module:{title:'Test',steps:{DECIDE:{}}},reasoning:'A sufficient explanation to check incomplete feedback safely.',key:'test-key',fetchImpl:async()=>({ok:true,json:async()=>({choices:[choice]})})}), {status:503})
  }
})
