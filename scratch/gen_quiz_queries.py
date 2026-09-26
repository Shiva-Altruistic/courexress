import os
from courexress.assessment import queries

js_content = '/**\n * Coursera Assessment GraphQL Queries for Web Extension\n */\n'
for name in ['GET_STATE_QUERY', 'SAVE_RESPONSES_QUERY', 'SUBMIT_DRAFT_QUERY', 'INITIATE_ATTEMPT_QUERY', 'ASSIGNMENT_FEEDBACK_QUERY']:
    val = getattr(queries, name)
    safe_val = val.replace('`', '\\`').replace('${', '\\${')
    js_content += f'\nexport const {name} = `{safe_val}`;\n'

out_path = os.path.join('extension', 'quiz_queries.js')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(js_content)

print('Generated', out_path, 'with size:', len(js_content))
