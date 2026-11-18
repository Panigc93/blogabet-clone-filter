// Local review entry, bundled by the screenshot harness, never a production route.
import React from 'react'
import {createRoot} from 'react-dom/client'
import {OlbgMonthlyPreview} from '../components/olbg/OlbgMonthlyPreview'
import profiles from '../tests/fixtures/olbg/published-monthly-real.json'
import type {PublishedMonthlyProfile} from '../lib/olbg-published-monthly'
createRoot(document.getElementById('root')!).render(<OlbgMonthlyPreview profiles={profiles as PublishedMonthlyProfile[]}/> )
