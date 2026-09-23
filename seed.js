// seed.js — populates PostgreSQL with realistic demo data.
// Safe to re-run: it truncates and reloads every table.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const hash = (pw) => bcrypt.hashSync(pw, 8);

// --- Destination photos --------------------------------------------------
// Tries Wikipedia's public REST summary API for a real, current photo of each
// place at seed time. Falls back to a deterministic placeholder if offline
// or the lookup fails, so seeding never produces a broken image.
async function getImage(wikiTitle, fallbackSeed) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      const src = data.originalimage?.source || data.thumbnail?.source;
      if (src) return src;
    }
  } catch { /* fall through to placeholder */ }
  return `https://picsum.photos/seed/${encodeURIComponent(fallbackSeed)}/900/600`;
}

function makeSamplePdf(title, text) {
  const content = `BT\n/F1 18 Tf\n50 740 Td\n(${title}) Tj\n/F1 12 Tf\n0 -34 Td\n(${text}) Tj\n0 -20 Td\n(Issued by: Ministry of Tourism & Culture) Tj\n0 -20 Td\n(Official Guide ID - Verified via TrailMate System) Tj\nET`;
  const streamLen = Buffer.byteLength(content);
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLen} >>
stream
${content}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000247 00000 n 
0000000${(310 + streamLen).toString().padStart(3, '0')} 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${380 + streamLen}
%%EOF`;
  return Buffer.from(pdf);
}

const PACKAGE_DEFS = [
  {
    title: 'Ooty Hill Station Retreat', destination: 'Ooty', state: 'Tamil Nadu', category: 'Hill Station',
    wiki: 'Ooty', duration_days: 4, price_inr: 12999, max_group_size: 15,
    description: 'Escape to the "Queen of Hill Stations" — misty tea gardens, colonial charm, and the iconic Nilgiri toy train.',
    itinerary: [
      { day: 1, title: 'Arrival & Ooty Lake', details: 'Check in, evening boating at Ooty Lake.' },
      { day: 2, title: 'Doddabetta & Botanical Garden', details: 'Sunrise at Doddabetta Peak, Government Botanical Garden, Tea Museum.' },
      { day: 3, title: 'Nilgiri Toy Train to Coonoor', details: 'Heritage toy train ride, Sim\'s Park, local tea estate visit.' },
      { day: 4, title: 'Rose Garden & Departure', details: 'Government Rose Garden, shopping, departure.' }
    ]
  },
  {
    title: 'Munnar Tea Garden Escape', destination: 'Munnar', state: 'Kerala', category: 'Hill Station',
    wiki: 'Munnar', duration_days: 5, price_inr: 15999, max_group_size: 12,
    description: 'Rolling emerald tea plantations, misty peaks, and wildlife in the Western Ghats of Kerala.',
    itinerary: [
      { day: 1, title: 'Arrival & Tea Museum', details: 'Check in, Tata Tea Museum tour.' },
      { day: 2, title: 'Eravikulam National Park', details: 'Nilgiri Tahr spotting, Rajamalai viewpoint.' },
      { day: 3, title: 'Mattupetty & Top Station', details: 'Mattupetty Dam, Echo Point, Top Station viewpoint.' },
      { day: 4, title: 'Plantation Trek & Spice Garden', details: 'Guided tea plantation trek, spice garden visit.' },
      { day: 5, title: 'Departure', details: 'Last-minute shopping and departure.' }
    ]
  },
  {
    title: 'Goa Beach Paradise', destination: 'Goa', state: 'Goa', category: 'Beach',
    wiki: 'Goa', duration_days: 4, price_inr: 13999, max_group_size: 20,
    description: 'Golden beaches, Portuguese heritage, and vibrant nightlife on India\'s favourite coastline.',
    itinerary: [
      { day: 1, title: 'Arrival & Baga Beach', details: 'Check in, evening at Baga/Calangute beach.' },
      { day: 2, title: 'Forts & Water Sports', details: 'Fort Aguada, parasailing and jet-ski at Candolim.' },
      { day: 3, title: 'South Goa & Old Goa', details: 'Basilica of Bom Jesus, Palolem beach sunset.' },
      { day: 4, title: 'Sunset Cruise & Departure', details: 'Mandovi river cruise, departure.' }
    ]
  },
  {
    title: 'Kerala Backwaters Cruise', destination: 'Alleppey', state: 'Kerala', category: 'Backwaters',
    wiki: 'Alappuzha', duration_days: 6, price_inr: 22999, max_group_size: 10,
    description: 'Drift through palm-fringed canals on a traditional houseboat — God\'s Own Country at its most serene.',
    itinerary: [
      { day: 1, title: 'Arrival in Kochi', details: 'Fort Kochi walking tour, Chinese fishing nets.' },
      { day: 2, title: 'Transfer to Alleppey', details: 'Houseboat check-in, backwater sunset cruise.' },
      { day: 3, title: 'Houseboat Cruise', details: 'Full-day cruise through the backwaters and paddy fields.' },
      { day: 4, title: 'Kumarakom Bird Sanctuary', details: 'Boat safari, bird watching.' },
      { day: 5, title: 'Ayurvedic Spa & Village Walk', details: 'Traditional spa session, coir-village walk.' },
      { day: 6, title: 'Departure', details: 'Check out and departure.' }
    ]
  },
  {
    title: 'Jaipur Royal Heritage Tour', destination: 'Jaipur', state: 'Rajasthan', category: 'Heritage',
    wiki: 'Jaipur', duration_days: 5, price_inr: 17999, max_group_size: 15,
    description: 'Forts, palaces, and bazaars of the Pink City — royal Rajasthan in full colour.',
    itinerary: [
      { day: 1, title: 'City Palace & Jantar Mantar', details: 'Arrival, City Palace complex, Jantar Mantar observatory.' },
      { day: 2, title: 'Amber & Nahargarh Forts', details: 'Amber Fort elephant gate, Nahargarh sunset viewpoint.' },
      { day: 3, title: 'Hawa Mahal & Bazaars', details: 'Hawa Mahal photo stop, Johari and Bapu bazaars.' },
      { day: 4, title: 'Chokhi Dhani Village', details: 'Rural Rajasthani village resort, folk dinner and dance.' },
      { day: 5, title: 'Departure', details: 'Check out and departure.' }
    ]
  },
  {
    title: 'Manali Adventure Trek', destination: 'Manali', state: 'Himachal Pradesh', category: 'Adventure',
    wiki: 'Manali, Himachal Pradesh', duration_days: 6, price_inr: 19999, max_group_size: 10,
    description: 'Snow-capped peaks, river valleys, and a real Himalayan trek for the adventure-hungry traveller.',
    itinerary: [
      { day: 1, title: 'Arrival & Old Manali', details: 'Check in, evening walk through Old Manali cafes.' },
      { day: 2, title: 'Solang Valley', details: 'Paragliding, zorbing, and cable car at Solang Valley.' },
      { day: 3, title: 'Rohtang Pass Excursion', details: 'Day trip to Rohtang Pass (snow-permitting).' },
      { day: 4, title: 'Hampta Pass Trek — Day 1', details: 'Trek begins, overnight camping.' },
      { day: 5, title: 'Hampta Pass Trek — Day 2', details: 'Trek continues, return to Manali by evening.' },
      { day: 6, title: 'Departure', details: 'Rest and departure.' }
    ]
  },
  {
    title: 'Rishikesh Yoga & Rafting', destination: 'Rishikesh', state: 'Uttarakhand', category: 'Adventure',
    wiki: 'Rishikesh', duration_days: 4, price_inr: 10999, max_group_size: 12,
    description: 'The Yoga Capital of the World — white-water rafting by day, Ganga Aarti by evening.',
    itinerary: [
      { day: 1, title: 'Arrival & Ganga Aarti', details: 'Check in, evening Ganga Aarti at Triveni Ghat.' },
      { day: 2, title: 'White Water Rafting', details: 'Grade II–III rapids on the Ganges.' },
      { day: 3, title: 'Yoga Retreat & Laxman Jhula', details: 'Morning yoga & meditation session, Laxman Jhula walk.' },
      { day: 4, title: 'Departure', details: 'Morning free, departure.' }
    ]
  },
  {
    title: 'Andaman Islands Getaway', destination: 'Havelock Island', state: 'Andaman & Nicobar', category: 'Beach',
    wiki: 'Havelock Island', duration_days: 7, price_inr: 34999, max_group_size: 10,
    description: 'Turquoise water, coral reefs, and some of Asia\'s finest beaches.',
    itinerary: [
      { day: 1, title: 'Arrival in Port Blair', details: 'Cellular Jail and light & sound show.' },
      { day: 2, title: 'Ferry to Havelock', details: 'Transfer to Havelock, evening at Radhanagar Beach.' },
      { day: 3, title: 'Scuba Diving', details: 'Guided scuba/snorkeling session at the reef.' },
      { day: 4, title: 'Elephant Beach', details: 'Kayaking and glass-bottom boat ride.' },
      { day: 5, title: 'Neil Island Day Trip', details: 'Bharatpur Beach and Natural Bridge.' },
      { day: 6, title: 'Leisure Day', details: 'Free day for relaxation, optional sunset cruise.' },
      { day: 7, title: 'Departure', details: 'Ferry back to Port Blair, departure.' }
    ]
  },
  {
    title: 'Coorg Coffee Trail', destination: 'Coorg', state: 'Karnataka', category: 'Hill Station',
    wiki: 'Kodagu district', duration_days: 4, price_inr: 11999, max_group_size: 12,
    description: 'Aromatic coffee estates, waterfalls, and the "Scotland of India".',
    itinerary: [
      { day: 1, title: 'Arrival & Plantation Walk', details: 'Check in, guided coffee plantation walk.' },
      { day: 2, title: 'Abbey Falls & Raja\'s Seat', details: 'Abbey Falls, sunset at Raja\'s Seat.' },
      { day: 3, title: 'Dubare Elephant Camp', details: 'Elephant interaction, river rafting on the Kaveri.' },
      { day: 4, title: 'Departure', details: 'Local market visit, departure.' }
    ]
  },
  {
    title: 'Varanasi Spiritual Journey', destination: 'Varanasi', state: 'Uttar Pradesh', category: 'Spiritual',
    wiki: 'Varanasi', duration_days: 3, price_inr: 8999, max_group_size: 15,
    description: 'India\'s oldest living city — sacred ghats, sunrise boat rides, and centuries of devotion.',
    itinerary: [
      { day: 1, title: 'Arrival & Ganga Aarti', details: 'Check in, evening Ganga Aarti at Dashashwamedh Ghat.' },
      { day: 2, title: 'Sunrise Boat Ride & Temples', details: 'Sunrise boat ride, Kashi Vishwanath Temple.' },
      { day: 3, title: 'Sarnath & Departure', details: 'Sarnath Buddhist site, departure.' }
    ]
  },
  {
    title: 'Udaipur Lake City Tour', destination: 'Udaipur', state: 'Rajasthan', category: 'Heritage',
    wiki: 'Udaipur', duration_days: 4, price_inr: 16999, max_group_size: 12,
    description: 'The "Venice of the East" — shimmering lakes, royal palaces, and romantic sunsets.',
    itinerary: [
      { day: 1, title: 'City Palace', details: 'Arrival, City Palace complex tour.' },
      { day: 2, title: 'Lake Pichola & Jag Mandir', details: 'Boat ride on Lake Pichola, Jag Mandir island palace.' },
      { day: 3, title: 'Saheliyon ki Bari', details: 'Garden of the Maidens, Fateh Sagar Lake.' },
      { day: 4, title: 'Departure', details: 'Local handicraft market, departure.' }
    ]
  },
  {
    title: 'Darjeeling Hills & Tea Estates', destination: 'Darjeeling', state: 'West Bengal', category: 'Hill Station',
    wiki: 'Darjeeling', duration_days: 5, price_inr: 16499, max_group_size: 10,
    description: 'Himalayan sunrises over Kanchenjunga, the world-famous toy train, and world-class tea estates.',
    itinerary: [
      { day: 1, title: 'Arrival & Mall Road', details: 'Check in, evening walk on Mall Road.' },
      { day: 2, title: 'Tiger Hill Sunrise', details: 'Sunrise over Kanchenjunga, Batasia Loop.' },
      { day: 3, title: 'Toy Train & Tea Estate', details: 'Darjeeling Himalayan Railway ride, tea estate tour & tasting.' },
      { day: 4, title: 'Peace Pagoda & Zoo', details: 'Japanese Peace Pagoda, Padmaja Naidu Himalayan Zoo.' },
      { day: 5, title: 'Departure', details: 'Local market, departure.' }
    ]
  }
];

const GUIDE_DEFS = [
  { name: 'Asha Menon', email: 'asha@guides.com', languages: ['Tamil', 'English', 'Hindi'], experience_years: 6, bio: 'Hill-station specialist with deep knowledge of the Nilgiris.', packages: ['Ooty Hill Station Retreat', 'Coorg Coffee Trail'] },
  { name: 'Meera Iyer', email: 'meera@guides.com', languages: ['Tamil', 'English'], experience_years: 3, bio: 'Passionate local guide for South Indian hill stations.', packages: ['Ooty Hill Station Retreat', 'Coorg Coffee Trail'] },
  { name: 'Divya Nair', email: 'divya@guides.com', languages: ['Malayalam', 'English', 'Tamil'], experience_years: 5, bio: 'Kerala backwaters and tea-country expert.', packages: ['Munnar Tea Garden Escape', 'Kerala Backwaters Cruise'] },
  { name: 'Karthik Pillai', email: 'karthik@guides.com', languages: ['Malayalam', 'English', 'Hindi'], experience_years: 8, bio: 'Veteran houseboat and plantation tour guide.', packages: ['Munnar Tea Garden Escape', 'Kerala Backwaters Cruise'] },
  { name: 'Fernando D\'Souza', email: 'fernando@guides.com', languages: ['Konkani', 'English', 'Hindi', 'Portuguese'], experience_years: 7, bio: 'Goa heritage and beach-culture specialist.', packages: ['Goa Beach Paradise'] },
  { name: 'Neha Kulkarni', email: 'neha@guides.com', languages: ['Marathi', 'Hindi', 'English', 'Konkani'], experience_years: 4, bio: 'Water-sports certified Goa tour guide.', packages: ['Goa Beach Paradise'] },
  { name: 'Vikram Singh', email: 'vikram@guides.com', languages: ['Hindi', 'English', 'Marwari'], experience_years: 10, bio: 'Rajasthan royal-heritage expert, 10+ years leading palace tours.', packages: ['Jaipur Royal Heritage Tour', 'Udaipur Lake City Tour'] },
  { name: 'Karan Mehta', email: 'karan@guides.com', languages: ['Hindi', 'English', 'Gujarati'], experience_years: 7, bio: 'Specialist in Rajasthani forts and palaces.', packages: ['Jaipur Royal Heritage Tour', 'Udaipur Lake City Tour'] },
  { name: 'Rahul Verma', email: 'rahul@guides.com', languages: ['Hindi', 'English'], experience_years: 8, bio: 'Certified Himalayan trekking and adventure guide.', packages: ['Manali Adventure Trek', 'Rishikesh Yoga & Rafting'] },
  { name: 'Sanjay Thapa', email: 'sanjay@guides.com', languages: ['Hindi', 'Nepali', 'English'], experience_years: 9, bio: 'Mountaineering-trained guide for high-altitude treks.', packages: ['Manali Adventure Trek', 'Rishikesh Yoga & Rafting'] },
  { name: 'Ananya Das', email: 'ananya@guides.com', languages: ['Bengali', 'Hindi', 'English'], experience_years: 4, bio: 'Darjeeling tea-estate and Himalayan railway expert.', packages: ['Darjeeling Hills & Tea Estates'] },
  { name: 'Priyanka Ghosh', email: 'priyanka@guides.com', languages: ['Bengali', 'Hindi', 'English'], experience_years: 3, bio: 'Local Darjeeling guide, born and raised in the hills.', packages: ['Darjeeling Hills & Tea Estates'] },
  { name: 'Arjun Reddy', email: 'arjun@guides.com', languages: ['Telugu', 'English', 'Hindi'], experience_years: 6, bio: 'PADI-certified diving instructor and island guide.', packages: ['Andaman Islands Getaway'] },
  { name: 'Rohan D\'Cruz', email: 'rohan@guides.com', languages: ['English', 'Hindi', 'Tamil'], experience_years: 5, bio: 'Andaman marine-life and snorkeling specialist.', packages: ['Andaman Islands Getaway'] },
  { name: 'Ravi Kumar', email: 'ravi@guides.com', languages: ['Hindi', 'Bhojpuri', 'English'], experience_years: 5, bio: 'Spiritual-tourism guide for the ghats of Varanasi.', packages: ['Varanasi Spiritual Journey'] },
  { name: 'Sunita Pandey', email: 'sunita@guides.com', languages: ['Hindi', 'English', 'Bhojpuri'], experience_years: 6, bio: 'Cultural historian specializing in Varanasi\'s temples.', packages: ['Varanasi Spiritual Journey'] }
];

async function main() {
  const client = await pool.connect();
  try {
    console.log('Clearing existing data...');
    await client.query('TRUNCATE reviews, payments, bookings, package_guides, documents, packages, users RESTART IDENTITY CASCADE');

    console.log('Creating admin & tourists...');
    await client.query(
      `INSERT INTO users (name, email, password_hash, phone, role, status)
       VALUES ($1,$2,$3,$4,'admin','active')`,
      ['System Admin', 'admin@tourbook.com', hash('admin123'), '9000000000']
    );
    const touristRows = [
      ['Priya Sharma', 'priya@tourist.com', 'tourist123', '9111111111', ['English', 'Hindi']],
      ['Arun Kumar', 'arun@tourist.com', 'tourist123', '9222222222', ['English', 'Tamil']]
    ];
    const touristIds = {};
    for (const [name, email, pw, phone, langs] of touristRows) {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, role, status, language_prefs)
         VALUES ($1,$2,$3,$4,'tourist','active',$5) RETURNING id`,
        [name, email, hash(pw), phone, langs]
      );
      touristIds[email] = rows[0].id;
    }

    console.log('Creating guides (fetching profile data)...');
    const guideIds = {};
    for (const g of GUIDE_DEFS) {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, role, status, bio, languages, experience_years, availability)
         VALUES ($1,$2,$3,$4,'guide','active',$5,$6,$7,true) RETURNING id`,
        [g.name, g.email, hash('guide123'), '9' + String(Math.floor(100000000 + Math.random() * 899999999)), g.bio, g.languages, g.experience_years]
      );
      guideIds[g.name] = rows[0].id;
    }

    console.log('Creating tour packages (this fetches real destination photos, may take a moment)...');
    const packageIds = {};
    for (const p of PACKAGE_DEFS) {
      const image_url = await getImage(p.wiki, p.destination);
      const { rows } = await client.query(
        `INSERT INTO packages (title, destination, state, category, description, itinerary, duration_days, price_inr, max_group_size, image_url, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active') RETURNING id`,
        [p.title, p.destination, p.state, p.category, p.description, JSON.stringify(p.itinerary), p.duration_days, p.price_inr, p.max_group_size, image_url]
      );
      packageIds[p.title] = rows[0].id;
      console.log(`  + ${p.title}`);
    }

    console.log('Linking guides to packages...');
    for (const g of GUIDE_DEFS) {
      for (const pkgTitle of g.packages) {
        await client.query(
          `INSERT INTO package_guides (package_id, guide_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [packageIds[pkgTitle], guideIds[g.name]]
        );
      }
    }

    console.log('Seeding demo verification documents with valid PDF binary content...');
    const ashaDoc = makeSamplePdf('Official Guide Certification', 'Guide: Asha Menon - ID: GOV-IN-68421 - Verified Professional Guide');
    const divyaDoc = makeSamplePdf('Tour Guide License Application', 'Guide: Divya Nair - License: TM-LIC-90422 - Kerala Tourism Board');

    await client.query(
      `INSERT INTO documents (guide_id, type, filename, content, mime_type, file_size, status) VALUES ($1,$2,$3,$4,'application/pdf',$5,'verified')`,
      [guideIds['Asha Menon'], 'Government ID', 'asha_id.pdf', ashaDoc, ashaDoc.length]
    );
    await client.query(
      `INSERT INTO documents (guide_id, type, filename, content, mime_type, file_size, status) VALUES ($1,$2,$3,$4,'application/pdf',$5,'pending')`,
      [guideIds['Divya Nair'], 'Government ID', 'divya_id.pdf', divyaDoc, divyaDoc.length]
    );

    console.log('Seeding a demo completed booking + review...');
    const demoBooking = await client.query(
      `INSERT INTO bookings (tourist_id, package_id, guide_id, tour_date, num_tourists, total_price_inr, status)
       VALUES ($1,$2,$3, CURRENT_DATE - INTERVAL '10 days', 2, $4, 'completed') RETURNING id`,
      [touristIds['priya@tourist.com'], packageIds['Ooty Hill Station Retreat'], guideIds['Asha Menon'], PACKAGE_DEFS[0].price_inr * 2]
    );
    await client.query(
      `INSERT INTO payments (booking_id, amount_inr, method, status, transaction_id) VALUES ($1,$2,'card','success',$3)`,
      [demoBooking.rows[0].id, PACKAGE_DEFS[0].price_inr * 2, `TXN-DEMO-${Date.now()}`]
    );
    await client.query(
      `INSERT INTO reviews (booking_id, tourist_id, guide_id, package_id, rating, comment)
       VALUES ($1,$2,$3,$4,5,'Asha was fantastic — knew every viewpoint and made the trip unforgettable!')`,
      [demoBooking.rows[0].id, touristIds['priya@tourist.com'], guideIds['Asha Menon'], packageIds['Ooty Hill Station Retreat']]
    );
    await client.query(
      `UPDATE users SET avg_rating = 5, review_count = 1, completed_tours = 1 WHERE id = $1`,
      [guideIds['Asha Menon']]
    );
    await client.query(
      `UPDATE packages SET avg_rating = 5, review_count = 1 WHERE id = $1`,
      [packageIds['Ooty Hill Station Retreat']]
    );

    console.log('\n✔ Seed complete.');
    console.log('\nDemo accounts:');
    console.log('  Admin   -> admin@tourbook.com / admin123');
    console.log('  Tourist -> priya@tourist.com / tourist123  (English, Hindi)');
    console.log('  Tourist -> arun@tourist.com / tourist123   (English, Tamil)');
    console.log('  Guide   -> asha@guides.com / guide123      (verified, has 1 review)');
    console.log('  Guide   -> divya@guides.com / guide123     (pending document verification)');
    console.log('  ...and 14 more guides, all password: guide123 (see GUIDE_DEFS in seed.js)');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('✘ Seed failed:', err);
  process.exit(1);
});
