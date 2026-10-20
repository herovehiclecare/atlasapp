// =====================================================================
// Atlas Instant Quote
//
// Two sides, one file:
//   CUSTOMER SIDE - everything outside the gear. Picks their work, sees a
//                   live range, sends the request.
//   OWNER SIDE    - the gear. Brand, Services and Questions tabs. Nothing
//                   here is visible to a customer.
//
// Every word, price and option the customer sees comes out of CONFIG, so a
// business can run this without touching code. Trade presets exist because
// "Year / Make / Model" is meaningless to a junk removal company - picking a
// trade reskins the questions, the size tiers and the starting catalog.
//
// In the shipped product CONFIG is the business's Atlas account (services,
// prices and categories are already tables there). Here it lives in
// localStorage so the demo is self-contained.
// =====================================================================

const CFG_KEY = "atlas-quote-config-v1";
// Hosted mode: the page lives at /e/<slug>. The setup comes from the business's Atlas
// account and Send writes a lead into it. Without a slug it is the local demo.
const SLUG = window.ATLAS_SLUG || "";
const openInfo = new Set();
const API = "https://fqggnekepfzxrkuazpiy.supabase.co/functions/v1/estimate-request";

// Two price tiers, always. They map to price_car_* / price_suv_* in Atlas, so
// the labels change per trade but the shape the database expects does not.
const TRADES = {
  detailing: {
    label: "Auto Detailing", item: "vehicle",
    fields: [
      { k:"year",  label:"Year",  ph:"2021", half:true, numeric:true, max:4 },
      { k:"make",  label:"Make",  ph:"Toyota", half:true },
      { k:"model", label:"Model", ph:"4Runner" },
    ],
    sizes: [{ id:"car", label:"Car / Sedan", hint:"Coupe, sedan, hatch" },
            { id:"suv", label:"SUV / Truck / Van", hint:"3-row, pickup, van" }],
    conditionQ: "How dirty is it right now?",
    frequencyQ: "How often does it get detailed?",
    services: [
      { cat:"Maintenance", name:"Express Wash & Seal", desc:"Outside wash, interior wipe-down and a spray sealant.", car:[120,160], suv:[140,185] },
      { cat:"Detailing", name:"Full Interior & Exterior", desc:"The complete clean, inside and out.", car:[250,340], suv:[290,420] },
      { cat:"Paint Correction", name:"Single-Stage Polish", desc:"One pass to cut light swirls and bring the gloss back.", car:[450,650], suv:[520,760] },
      { cat:"Ceramic Coating", name:"3 Year Coating", desc:"Longer-life coating with a light correction included.", car:[900,1400], suv:[1100,1700] },
    ],
    addons: [{ name:"Wheel Coating", price:150 }, { name:"Pet Hair Removal", price:90 }],
  },
  // Junk removal prices by how much of the truck the job fills, not by a size
  // tier - so load size IS the service list. The tier is access instead, since
  // stairs and inside carries are what actually move the price.
  junk: {
    label: "Junk Removal", item: "job",
    fields: [
      { k:"what",  label:"What needs removing?", ph:"Garage clear-out, old sofa" },
      { k:"where", label:"Where is it?", ph:"Garage, upstairs, back yard" },
    ],
    sizes: [{ id:"car", label:"Curbside", hint:"Already outside" },
            { id:"suv", label:"Inside or stairs", hint:"We carry it out" }],
    conditionQ: "How heavy is it?",
    frequencyQ: "How soon do you need it gone?",
    services: [
      { cat:"Single Items", name:"One Large Item", desc:"Sofa, mattress, appliance - hauled and disposed of.", car:[90,150], suv:[120,190] },
      { cat:"Single Items", name:"Appliance or Mattress", desc:"Includes the special disposal fee.", car:[110,180], suv:[140,220] },
      { cat:"Truck Loads", name:"Minimum Load", desc:"About an eighth of the truck. Our smallest job.", car:[100,175], suv:[130,215] },
      { cat:"Truck Loads", name:"Quarter Truck Load", desc:"Roughly a quarter of the truck, loaded and hauled.", car:[150,300], suv:[190,370] },
      { cat:"Truck Loads", name:"Half Truck Load", desc:"About half the truck, loaded and swept up.", car:[250,550], suv:[310,650] },
      { cat:"Truck Loads", name:"Full Truck Load", desc:"A full truck, loaded, hauled and the area swept.", car:[550,1000], suv:[650,1200] },
      { cat:"Clean-Outs", name:"Garage or Estate Clean-Out", desc:"Whole-space clear-out, start to finish.", car:[700,1600], suv:[900,2000] },
    ],
    addons: [{ name:"Same-day pickup", price:75 }, { name:"Heavy item surcharge", price:60 },
             { name:"Special disposal (paint, tyres)", price:45 }],
  },
  pressure: {
    label: "Pressure Washing", item: "property",
    fields: [
      { k:"what", label:"What needs washing?", ph:"Driveway, siding, deck" },
      { k:"size", label:"Roughly how big?", ph:"2-car driveway" },
    ],
    // Storeys is the real price driver here - two-storey work needs different
    // kit and more setup - so that's the tier rather than a vague small/large.
    sizes: [{ id:"car", label:"Single storey", hint:"Ground level" },
            { id:"suv", label:"Two storey +", hint:"More reach and setup" }],
    conditionQ: "How dirty is it right now?",
    frequencyQ: "How often does it get washed?",
    services: [
      { cat:"Driveways & Walkways", name:"Driveway Wash", desc:"Two-car driveway, concrete, pavers or stone.", car:[150,300], suv:[200,380] },
      { cat:"Driveways & Walkways", name:"Walkways & Patio", desc:"Paths, steps and patio areas cleaned down.", car:[120,260], suv:[160,330] },
      { cat:"House Washing", name:"Soft Wash - Full House", desc:"Low-pressure wash that lifts mould without damaging siding.", car:[250,600], suv:[400,900] },
      { cat:"House Washing", name:"Roof Soft Wash", desc:"Gentle treatment for moss and black streaking.", car:[350,700], suv:[500,1100] },
      { cat:"Decks & Fences", name:"Deck or Fence Wash", desc:"Strip back the grey and bring the timber up.", car:[180,400], suv:[250,550] },
    ],
    addons: [{ name:"Sealing after wash", price:180 }, { name:"Gutter face cleaning", price:95 },
             { name:"Rust or oil stain treatment", price:120 }],
  },
  roofing: {
    label: "Roofing", item: "roof",
    fields: [{ k:"material", label:"Roof type", ph:"Asphalt shingle, metal, tile" },
             { k:"size", label:"Roughly how big?", ph:"1,800 sq ft", half:true },
             { k:"stories", label:"Stories", ph:"2", half:true, numeric:true, max:2 }],
    sizes: [{ id:"car", label:"Single story", hint:"Ground level access" },
            { id:"suv", label:"Two storey +", hint:"Harder access" }],
    conditionQ: "What shape is it in?",
    frequencyQ: "How soon do you need it?",
    services: [
      { cat:"Repairs", name:"Leak Repair", desc:"Find the leak, fix it, check the surrounding area.", car:[350,900], suv:[450,1200] },
      { cat:"Repairs", name:"Shingle & Flashing Repair", desc:"Replace damaged shingles and reseal flashing.", car:[500,1400], suv:[650,1800] },
      { cat:"Replacement", name:"Full Roof Replacement", desc:"Tear off, deck check, underlayment and new roof.", car:[9000,null], suv:[12000,null] },
      { cat:"Maintenance", name:"Inspection & Tune-Up", desc:"Full check, minor seals, and a written report.", car:[200,400], suv:[250,500] },
    ],
    addons: [{ name:"Gutter replacement", price:900 }, { name:"Skylight or vent flashing", price:250 }],
  },
  plumbing: {
    label: "Plumbing", item: "job",
    fields: [{ k:"what", label:"What's going on?", ph:"Leaking water heater, blocked drain" },
             { k:"where", label:"Where in the home?", ph:"Kitchen, main bathroom" }],
    sizes: [{ id:"car", label:"One fixture", hint:"Single spot" },
            { id:"suv", label:"Whole home", hint:"Multiple or main line" }],
    conditionQ: "How bad is it?",
    frequencyQ: "How soon do you need someone?",
    services: [
      { cat:"Repairs", name:"Leak Locate & Repair", desc:"Track the leak down, repair, and pressure test.", car:[200,550], suv:[350,900] },
      { cat:"Repairs", name:"Drain Clearing", desc:"Clear the blockage and check the line runs clean.", car:[150,400], suv:[250,650] },
      { cat:"Installs", name:"Faucet or Toilet Install", desc:"Remove the old one, fit the new, leak test.", car:[200,450], suv:[300,650] },
      { cat:"Installs", name:"Water Heater Replacement", desc:"Haul the old unit, install and connect to code.", car:[1400,2400], suv:[1800,3200] },
    ],
    addons: [{ name:"After-hours call-out", price:150 }, { name:"Haul away old unit", price:80 }],
  },
  electrical: {
    label: "Electrical", item: "job",
    fields: [{ k:"what", label:"What needs doing?", ph:"New outlets, panel upgrade, EV charger" },
             { k:"where", label:"Where?", ph:"Garage, kitchen, whole house" }],
    sizes: [{ id:"car", label:"Small job", hint:"One or two points" },
            { id:"suv", label:"Panel or whole home", hint:"Bigger scope" }],
    conditionQ: "How big is the job?",
    frequencyQ: "How soon do you need it?",
    services: [
      { cat:"Outlets & Switches", name:"Outlet or Switch Install", desc:"Add or replace, tested and to code.", car:[150,300], suv:[250,500] },
      { cat:"Lighting", name:"Light or Ceiling Fan Install", desc:"Mount, wire, test and clean up.", car:[200,450], suv:[300,650] },
      { cat:"Panels & Circuits", name:"Panel Upgrade", desc:"New panel, permit and inspection included.", car:[1800,3200], suv:[2400,4500] },
      { cat:"Panels & Circuits", name:"EV Charger Install", desc:"Dedicated circuit, charger mounted and wired.", car:[900,1800], suv:[1200,2400] },
    ],
    addons: [{ name:"Permit handling", price:180 }, { name:"Surge protection", price:300 }],
  },
  hvac: {
    label: "HVAC", item: "system",
    fields: [{ k:"system", label:"What system?", ph:"Central air, heat pump, furnace" },
             { k:"size", label:"Home size", ph:"1,600 sq ft" }],
    sizes: [{ id:"car", label:"Single unit", hint:"One system" },
            { id:"suv", label:"Multi-zone", hint:"Two or more" }],
    conditionQ: "How is it running?",
    frequencyQ: "How soon do you need it?",
    services: [
      { cat:"Service", name:"Tune-Up & Service", desc:"Full check, clean, and a performance report.", car:[120,250], suv:[200,400] },
      { cat:"Repairs", name:"Diagnostic & Repair", desc:"Find the fault and fix it where we can same visit.", car:[200,700], suv:[350,1100] },
      { cat:"Replacement", name:"AC Replacement", desc:"New unit sized to the home, installed and tested.", car:[4500,7500], suv:[6500,11000] },
      { cat:"Replacement", name:"Furnace Replacement", desc:"New furnace, sized after a heating load check.", car:[3800,6500], suv:[5500,9500] },
    ],
    addons: [{ name:"Duct cleaning", price:450 }, { name:"Smart thermostat", price:280 }],
  },
  handyman: {
    label: "Handyman", item: "job",
    fields: [{ k:"what", label:"What needs doing?", ph:"Hang shelves, fix a door, patch drywall" },
             { k:"where", label:"Where?", ph:"Living room, garage" }],
    sizes: [{ id:"car", label:"Quick fix", hint:"An hour or two" },
            { id:"suv", label:"Half day +", hint:"Bigger list" }],
    conditionQ: "How involved is it?",
    frequencyQ: "How soon do you need it?",
    services: [
      { cat:"Repairs", name:"General Repair Visit", desc:"Hourly visit for the small stuff on your list.", car:[120,260], suv:[280,550] },
      { cat:"Installs", name:"Mounting & Hanging", desc:"TVs, shelves, mirrors, blinds - level and secure.", car:[100,240], suv:[220,450] },
      { cat:"Installs", name:"Fixture & Appliance Install", desc:"Swap out lights, faucets, fans and more.", car:[150,350], suv:[280,600] },
      { cat:"Repairs", name:"Drywall Patch & Paint", desc:"Patch, sand, prime and colour match.", car:[180,420], suv:[350,800] },
    ],
    addons: [{ name:"Materials pickup", price:60 }, { name:"Haul away debris", price:90 }],
  },
  landscaping: {
    label: "Landscaping", item: "yard",
    fields: [{ k:"what", label:"What do you need?", ph:"Clean-up, mowing, new beds" },
             { k:"size", label:"Roughly how big?", ph:"Quarter acre" }],
    sizes: [{ id:"car", label:"Small yard", hint:"Townhome or small lot" },
            { id:"suv", label:"Large yard", hint:"Quarter acre +" }],
    conditionQ: "What state is it in?",
    frequencyQ: "How often do you want it done?",
    services: [
      { cat:"Maintenance", name:"Mow, Edge & Blow", desc:"Regular cut, edges tidied, everything blown clean.", car:[45,90], suv:[80,160] },
      { cat:"Clean-Ups", name:"Seasonal Clean-Up", desc:"Beds cut back, leaves cleared, debris hauled.", car:[250,500], suv:[450,900] },
      { cat:"Planting", name:"Sod or Seed Repair", desc:"Fix thin or bare patches with sod or seed.", car:[400,900], suv:[800,1800] },
      { cat:"Planting", name:"Mulch & Bed Refresh", desc:"Weed, edge and re-mulch the beds.", car:[300,650], suv:[550,1200] },
    ],
    addons: [{ name:"Tree or shrub trimming", price:180 }, { name:"Debris haul away", price:120 }],
  },
  painting: {
    label: "Painting", item: "project",
    fields: [{ k:"what", label:"What are we painting?", ph:"Living room, whole exterior" },
             { k:"rooms", label:"How many rooms or sides?", ph:"3 rooms" }],
    sizes: [{ id:"car", label:"Small job", hint:"A room or two" },
            { id:"suv", label:"Large job", hint:"Whole home" }],
    conditionQ: "What shape are the surfaces in?",
    frequencyQ: "How soon do you need it?",
    services: [
      { cat:"Interior", name:"Interior Repaint", desc:"Walls prepped, cut in and rolled, two coats.", car:[400,900], suv:[1800,4500] },
      { cat:"Interior", name:"Cabinet Refinish", desc:"Degrease, sand, prime and spray. Hardware refitted.", car:[1800,3500], suv:[2800,5500] },
      { cat:"Exterior", name:"Exterior Repaint", desc:"Wash, scrape, prime and two finish coats.", car:[2500,5000], suv:[4500,9500] },
      { cat:"Exterior", name:"Deck or Fence Stain", desc:"Cleaned and stained to protect the timber.", car:[600,1200], suv:[1100,2200] },
    ],
    addons: [{ name:"Ceilings included", price:350 }, { name:"Trim and doors", price:450 }],
  },
  pest: {
    label: "Pest Control", item: "property",
    fields: [{ k:"what", label:"What are you seeing?", ph:"Ants, roaches, rodents" },
             { k:"where", label:"Where?", ph:"Kitchen, attic, whole house" }],
    sizes: [{ id:"car", label:"Apartment or condo", hint:"Smaller space" },
            { id:"suv", label:"House", hint:"Full property" }],
    conditionQ: "How active is it?",
    frequencyQ: "How often do you want treatment?",
    services: [
      { cat:"Treatment", name:"General Pest Treatment", desc:"Interior and exterior treatment with a follow-up.", car:[90,180], suv:[140,280] },
      { cat:"Treatment", name:"Rodent Control", desc:"Trapping, exclusion points sealed, and monitoring.", car:[250,600], suv:[400,950] },
      { cat:"Treatment", name:"Termite Inspection & Treat", desc:"Full inspection, treatment plan and report.", car:[400,1200], suv:[700,2200] },
      { cat:"Plans", name:"Quarterly Plan", desc:"Scheduled treatments through the year.", car:[90,150], suv:[130,220] },
    ],
    addons: [{ name:"Mosquito yard treatment", price:120 }, { name:"Attic sanitation", price:400 }],
  },
  windows: {
    label: "Window Cleaning", item: "property",
    fields: [{ k:"count", label:"Roughly how many windows?", ph:"18", half:true, numeric:true, max:3 },
             { k:"access", label:"Anything hard to reach?", ph:"Second storey, skylights", half:true }],
    sizes: [{ id:"car", label:"Single story", hint:"Ground level" },
            { id:"suv", label:"Two storey +", hint:"Ladder work" }],
    conditionQ: "How dirty are they?",
    frequencyQ: "How often do you want them done?",
    services: [
      { cat:"Residential", name:"Exterior Window Clean", desc:"Outside glass, frames wiped, sills cleaned.", car:[120,220], suv:[200,380] },
      { cat:"Residential", name:"Inside & Out", desc:"Both sides, tracks vacuumed, screens washed.", car:[200,380], suv:[350,650] },
      { cat:"Add-On Surfaces", name:"Screen & Track Clean", desc:"Screens removed, washed and refitted.", car:[60,140], suv:[110,240] },
      { cat:"Commercial", name:"Storefront Glass", desc:"Regular route cleaning for shopfronts.", car:[80,200], suv:[150,400] },
    ],
    addons: [{ name:"Skylights", price:90 }, { name:"Hard water stain removal", price:150 }],
  },
  carpet: {
    label: "Carpet Cleaning", item: "job",
    fields: [{ k:"rooms", label:"How many rooms?", ph:"3", half:true, numeric:true, max:2 },
             { k:"issues", label:"Any stains or pet areas?", ph:"Pet stains in hallway", half:true }],
    sizes: [{ id:"car", label:"Up to 3 rooms", hint:"Smaller job" },
            { id:"suv", label:"4 rooms +", hint:"Whole home" }],
    conditionQ: "What condition is it in?",
    frequencyQ: "How often does it get cleaned?",
    services: [
      { cat:"Carpet", name:"Steam Clean", desc:"Hot water extraction, deodorised and groomed.", car:[120,260], suv:[220,450] },
      { cat:"Carpet", name:"Deep Clean & Stain Treat", desc:"Pre-treat, agitate, extract. Tough spots targeted.", car:[200,400], suv:[350,700] },
      { cat:"Upholstery", name:"Sofa & Upholstery Clean", desc:"Fabric-safe clean for sofas and chairs.", car:[100,240], suv:[180,420] },
      { cat:"Protection", name:"Fabric Protector", desc:"Applied after cleaning to resist future spills.", car:[60,140], suv:[110,250] },
    ],
    addons: [{ name:"Pet odour treatment", price:90 }, { name:"Area rug cleaning", price:120 }],
  },
  house: {
    label: "House Cleaning", item: "home",
    fields: [{ k:"beds", label:"Bedrooms", ph:"3", half:true, numeric:true, max:2 },
             { k:"baths", label:"Bathrooms", ph:"2", half:true, numeric:true, max:2 }],
    sizes: [{ id:"car", label:"Apartment", hint:"Condo or small home" },
            { id:"suv", label:"House", hint:"Larger home" }],
    conditionQ: "How much work is it?",
    frequencyQ: "How often do you want it cleaned?",
    services: [
      { cat:"Regular", name:"Standard Clean", desc:"Kitchen, bathrooms, floors, dusting throughout.", car:[110,190], suv:[170,290] },
      { cat:"Deep", name:"Deep Clean", desc:"Everything in a standard clean, plus the detail work.", car:[220,380], suv:[320,580] },
      { cat:"Move", name:"Move In / Move Out", desc:"Empty-home clean, inside cabinets and appliances.", car:[280,480], suv:[420,750] },
      { cat:"Regular", name:"Recurring Plan", desc:"Scheduled clean every week or two.", car:[95,160], suv:[145,250] },
    ],
    addons: [{ name:"Inside fridge or oven", price:60 }, { name:"Laundry & linens", price:50 }],
  },
};

const DEFAULTS = {
  trade: "detailing",
  brand: {
    name:"Summit Auto Care", kick:"Free Estimate",
    tagline:"Mobile detailing & paint protection",
    phone:"(555) 012-3456", email:"hello@summitautocare.com",
    replyWindow:"within 1 business hour", logo:"", accent:"#18D97A",
    theme:"forest", pattern:"on",
    instagram:"", facebook:"", tiktok:"", google:"",
  },
  copy: {
    headline:"Get Your Quote",
    sub:"Tell us what you've got. You'll see the price range straight away, then send it over and we'll confirm the exact number.",
    step1:"Pick your work", step2:"How do we reach you?",
    disclaimerTitle:"This is an estimate, not a final price.",
    disclaimer:"confirms the exact number once they see it. Nothing is booked and no card is needed.",
  },
  conditions: [
    { id:"light",    label:"Light",    hint:"Easy job",      lo:0,   hi:.25 },
    { id:"moderate", label:"Moderate", hint:"About average", lo:.25, hi:.65 },
    { id:"heavy",    label:"Heavy",    hint:"Needs real work", lo:.65, hi:1 },
  ],
  frequencies: [
    { id:"monthly", label:"About monthly",       uplift:0 },
    { id:"few",     label:"Every few months",    uplift:0 },
    { id:"twice",   label:"Twice a year",        uplift:5 },
    { id:"rare",    label:"Once a year or less", uplift:10 },
  ],
};

const ACCENTS = ["#18D97A","#3B9BFF","#A855F7","#F59E0B","#EF4444","#14B8A6","#E8B84A","#F43F8E"];

// Background is the neutral set only - the accent stays separate, so a business
// can pick "charcoal + orange" without us shipping a colour for every pair.
const THEMES = {
  forest:   { label:"Forest",   bg:"#06100C", panel:"#0B1813", panel2:"#0F1B15", line:"#1E2E25", text:"#EDF6F1", muted:"#92AA9D", dim:"#566B5E", ink:"#06100C" },
  midnight: { label:"Midnight", bg:"#060A14", panel:"#0B1020", panel2:"#0E1426", line:"#1E2740", text:"#EDF1F6", muted:"#93A0BB", dim:"#5A6680", ink:"#060A14" },
  charcoal: { label:"Charcoal", bg:"#0C0C0D", panel:"#141416", panel2:"#18181B", line:"#2A2A2E", text:"#F2F2F3", muted:"#A1A1A8", dim:"#6B6B73", ink:"#0C0C0D" },
  bone:     { label:"Light",    bg:"#F4F6F5", panel:"#FFFFFF", panel2:"#FFFFFF", line:"#DFE5E1", text:"#111C17", muted:"#56665D", dim:"#8A978F", ink:"#0B1813" },
};
const PATTERNS = { on:{ label:"On", o:.62 }, subtle:{ label:"Subtle", o:.3 }, off:{ label:"Off", o:0 } };
const SOCIAL = {
  instagram:{ label:"Instagram", icon:'<rect x="3" y="3" width="18" height="18" rx="6" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor"/>' },
  facebook:{ label:"Facebook", icon:'<path d="M14 8.5h2V5.2h-2.2C11.5 5.2 10 6.7 10 9v2H8v3.3h2V19h3.3v-4.7h2.3l.4-3.3h-2.7V9c0-.4.3-.5.5-.5Z" fill="currentColor"/>' },
  tiktok:{ label:"TikTok", icon:'<path d="M13.2 3.5c.4 1.8 1.6 2.9 3.5 3.1v2.6a6.6 6.6 0 0 1-3.5-1v6.1a4.7 4.7 0 1 1-4-4.6v2.7a2 2 0 1 0 1.5 1.9V3.5h2.5Z" fill="currentColor"/>' },
  google:{ label:"Google Reviews", icon:'<path d="M12 2.6l2.3 5 5.5.6-4.1 3.7 1.2 5.5L12 14.7l-4.9 2.7 1.2-5.5-4.1-3.7 5.5-.6L12 2.6Z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>' },
};

const PEAK = '<svg width="30" height="30" viewBox="0 0 100 100" aria-hidden="true"><path d="M18 82 L49 33 L51 33 L82 82" stroke="#18D97A" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="50" cy="31" r="18" fill="#35E890"/></svg>';
const ATLASMARK = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M18 82 L49 33 L51 33 L82 82" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="50" cy="31" r="18" fill="currentColor"/></svg>';
const CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.2 5.2L20 7"/></svg>';
const CHEV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const ic = d => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  phone: ic('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>'),
  chat:  ic('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 20.5l1.5-4.6A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"/>'),
  mail:  ic('<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="M3 6.5l9 6.5 9-6.5"/>'),
  trash: ic('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
};

// ---------------------------------------------------------------- config
function seedFromTrade(tradeId){
  const t = TRADES[tradeId];
  return {
    ...structuredClone(DEFAULTS),
    trade: tradeId,
    sizes: structuredClone(t.sizes),
    fields: structuredClone(t.fields),
    conditionQ: t.conditionQ,
    frequencyQ: t.frequencyQ,
    services: structuredClone(t.services),
    addons: structuredClone(t.addons),
  };
}
function loadConfig(){
  if (SLUG) return seedFromTrade(DEFAULTS.trade);
  try {
    const saved = JSON.parse(localStorage.getItem(CFG_KEY) || "null");
    if (saved && saved.services) return saved;
  } catch {}
  return seedFromTrade(DEFAULTS.trade);
}
let CFG = loadConfig();
const saveConfig = () => { if (SLUG) return; try { localStorage.setItem(CFG_KEY, JSON.stringify(CFG)); } catch {} };
const B = () => CFG.brand;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = n => "$" + Math.round(n).toLocaleString();
const round5 = n => Math.round(n/5)*5;
const digits = s => String(s||"").replace(/[^\d+]/g,"");
const normUrl = u => !u ? "" : (/^https?:\/\//i.test(u) ? u : "https://"+u);
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

function lighten(hex, amt){
  const n = parseInt(String(hex).replace("#",""),16);
  if (Number.isNaN(n)) return hex;
  const mix = c => Math.round(c + (255-c)*amt);
  return "#" + [16,8,0].map(sh => mix((n>>sh)&255).toString(16).padStart(2,"0")).join("");
}
function rgba(hex, a){
  const n = parseInt(String(hex).replace("#",""),16);
  if (Number.isNaN(n)) return `rgba(24,217,122,${a})`;
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
function applyBrand(){
  const r = document.documentElement.style, a = B().accent;
  const th = THEMES[B().theme] || THEMES.forest;
  const light = B().theme === "bone";

  ["bg","panel","panel2","line","text","muted","dim"].forEach(k => r.setProperty("--"+k, th[k]));
  r.setProperty("--accent", a);
  r.setProperty("--accent2", light ? a : lighten(a,.28));
  r.setProperty("--onaccent", th.ink);
  r.setProperty("--scrim", rgba(light ? "#2A322D" : "#030806", .72));
  r.setProperty("--barbg", rgba(th.bg, .95));
  // Hero and header glow are mixed from the accent, so they follow the brand
  // instead of staying the green they were first designed in.
  r.setProperty("--herobg", `linear-gradient(160deg, ${rgba(a, light?.20:.26)}, ${rgba(a, light?.08:.12)})`);
  r.setProperty("--bloom", `radial-gradient(130% 62% at 50% -8%, ${rgba(a,.13)}, ${rgba(a,.04)} 42%, transparent 70%)`);
  r.setProperty("--bandbg", `linear-gradient(165deg, ${rgba(a,.10)}, ${rgba(a,.02)})`);
  r.setProperty("--printo", String((PATTERNS[B().pattern] || PATTERNS.on).o));
  // The header band, the hero's small print and every soft accent tint were
  // written against a dark ground; on a light theme they have to flip.
  r.setProperty("--bandbase", `linear-gradient(165deg, ${rgba(th.panel2,.92)}, ${rgba(th.panel2,.92)})`);
  r.setProperty("--herotext", light ? rgba(th.text,.72) : "rgba(237,246,241,.72)");
  r.setProperty("--accentsoft", rgba(a,.45));
  r.setProperty("--notebg", rgba(a, light ? .09 : .08));
  document.body.classList.toggle("light", light);
}

// ------------------------------------------------- home screen icon + name
// "Add to Home Screen" reads the page's icon and title at the moment you tap
// it. Without an apple-touch-icon iOS invents a letter tile, which is why an
// uploaded logo never showed up - it lives in storage, not in the document.
// So both get written into the DOM whenever the brand changes.
function peakIcon(size){
  const c = document.createElement("canvas"); c.width = c.height = size;
  const x = c.getContext("2d"), th = THEMES[B().theme] || THEMES.forest;
  x.fillStyle = th.bg; x.fillRect(0,0,size,size);
  const k = size/100, px = (a,b) => [a*k, b*k];
  x.strokeStyle = B().accent; x.lineWidth = 13*k; x.lineCap = "round"; x.lineJoin = "round";
  x.beginPath(); x.moveTo(...px(18,82)); x.lineTo(...px(49,33)); x.lineTo(...px(51,33)); x.lineTo(...px(82,82)); x.stroke();
  x.fillStyle = lighten(B().accent,.2);
  x.beginPath(); x.arc(50*k, 31*k, 18*k, 0, Math.PI*2); x.fill();
  return c.toDataURL("image/png");
}
function setLink(rel, href, extra){
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el){ el = document.createElement("link"); el.rel = rel; document.head.appendChild(el); }
  if (extra) Object.entries(extra).forEach(([k,v]) => el.setAttribute(k,v));
  el.href = href;
}
let manifestUrl = "";
function applyAppIdentity(){
  const icon = B().logo || peakIcon(256);
  const th = THEMES[B().theme] || THEMES.forest;
  document.title = B().name ? `${B().name} — ${CFG.copy.headline}` : CFG.copy.headline;
  setLink("apple-touch-icon", icon);
  setLink("icon", icon, { type: B().logo ? "image/jpeg" : "image/png" });
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta){ meta = document.createElement("meta"); meta.name = "theme-color"; document.head.appendChild(meta); }
  meta.content = th.bg;
  // Android reads the manifest rather than apple-touch-icon.
  try {
    if (manifestUrl) URL.revokeObjectURL(manifestUrl);
    const mf = { name: B().name || "Get Your Quote", short_name: (B().name||"Quote").slice(0,12),
      start_url: location.pathname + location.search, display: "standalone",
      background_color: th.bg, theme_color: th.bg,
      icons: [{ src: icon, sizes: "256x256", type: B().logo ? "image/jpeg" : "image/png", purpose: "any" }] };
    manifestUrl = URL.createObjectURL(new Blob([JSON.stringify(mf)], { type: "application/manifest+json" }));
    setLink("manifest", manifestUrl);
  } catch {}
}

// ---------------------------------------------------------------- pricing
// Condition decides where inside the business's own low-high band a job sits.
// Frequency only ever lifts the top, so the floor can't drop below what they set.
function priceFor(svc, v){
  const tier = v.size === "suv" ? "suv" : "car";
  const band = svc[tier] || [0,null];
  const low = Number(band[0]) || 0, rawHigh = band[1];
  const c = CFG.conditions.find(x=>x.id===v.condition) || CFG.conditions[0] || { lo:0, hi:1 };
  const f = CFG.frequencies.find(x=>x.id===v.frequency) || { uplift:0 };
  const up = (Number(f.uplift)||0)/100;
  if (rawHigh == null || rawHigh === "") {
    const ch = CFG.conditions.length ? (Number(c.hi)||0) : 0;
    return { low:round5(low), high:round5(low + low*(ch*0.18 + up)), open:true };
  }
  const high = Number(rawHigh) || low, spread = Math.max(0, high-low);
  return { low:round5(low + spread*(Number(c.lo)||0)),
           high:round5((low + spread*(Number(c.hi)||0))*(1+up)), open:false };
}
const categories = () => [...new Set(CFG.services.map(s=>s.cat).filter(Boolean))];
function catTotal(v, cat){
  let low=0, high=0, n=0, open=false;
  CFG.services.filter(s=>s.cat===cat).forEach(s=>{
    if(!v.services.includes(s.name)) return;
    const p=priceFor(s,v); low+=p.low; high+=p.high; open=open||p.open; n++;
  });
  return { low, high, n, open };
}
function addonTotal(v){
  let low=0,n=0;
  v.addons.forEach(name=>{ const a=CFG.addons.find(x=>x.name===name); if(a){ low+=Number(a.price)||0; n++; } });
  return { low, high:low, n, open:false };
}
function itemTotal(v){
  let low=0, high=0, open=false;
  categories().forEach(c=>{ const t=catTotal(v,c); low+=t.low; high+=t.high; open=open||t.open; });
  const a=addonTotal(v); low+=a.low; high+=a.high;
  return { low, high, open };
}
const grandTotal = () => state.items.reduce((a,v)=>{ const t=itemTotal(v);
  return { low:a.low+t.low, high:a.high+t.high, open:a.open||t.open }; }, {low:0,high:0,open:false});
function rangeText(t){ if(!t.low && !t.high) return "—"; if(t.low===t.high) return money(t.low); return money(t.low)+" – "+money(t.high); }
function totText(t){ if(!t.low && !t.high) return "—"; if(t.open && t.high<=t.low) return "from "+money(t.low); return rangeText(t)+(t.open?"+":""); }
const catFrom = (v,cat) => { const r=CFG.services.filter(s=>s.cat===cat).map(s=>priceFor(s,v).low); return r.length?Math.min(...r):0; };

// ---------------------------------------------------------------- state
function newItem(open){
  return { id:Math.random().toString(36).slice(2,9), vals:{},
    size:(CFG.sizes[0]||{}).id || "car",
    condition:(CFG.conditions[1]||CFG.conditions[0]||{}).id || "moderate",
    frequency:(CFG.frequencies[1]||CFG.frequencies[0]||{}).id || "few",
    services:[], addons:[], detailsOpen:!!open, openCats:categories().slice(0,1) };
}
function prefill(){
  const q = new URLSearchParams(location.search), pick = k => (q.get(k)||"").slice(0,160);
  return { name:pick("name"), phone:pick("phone"), email:pick("email"), address:pick("address"), notes:pick("notes") };
}
let state = { screen:"form", items:[newItem(false)], contact:prefill(), contactOpen:false, touched:false, openReq:"", openOpen:false, other:false };
let editor = { open:false, tab:"brand", openSvc:null };

const vehMode = () => CFG.trade==="detailing" && CFG.sizes.length>1;
const anyPicked = () => !state.other && state.items.some(v=>v.services.length||v.addons.length);
const hasOpen = () => (state.other || !vehMode()) && state.openReq.trim().length >= 3;
const canSend = () => state.other ? hasOpen() : (anyPicked() || hasOpen());
const ctaText = () => state.other ? "Request a quote" : "Send request";
const totShown = () => state.other || (!anyPicked() && hasOpen()) ? "We'll quote it" : totText(grandTotal());
const contactReady = () => { const c=state.contact;
  return c.name.trim().length>1 && (c.phone.trim().length>=7 || /\S+@\S+\.\S+/.test(c.email)); };
const itemLabel = (v,i) => CFG.fields.map(f=>v.vals[f.k]).filter(Boolean).join(" ")
  || (state.items.length>1 ? `${TRADES[CFG.trade]?.item||"Item"} ${i+1}`.replace(/^./,m=>m.toUpperCase()) : `Your ${TRADES[CFG.trade]?.item||"job"}`);

// ============================================================ CUSTOMER SIDE
function accordion({ open, name, meta, metaHas, count, body, act, i, val }){
  return `<div class="acc${open?" on":""}">
    <button class="acchead" aria-expanded="${open}" data-act="${act}"${i!==undefined?` data-i="${i}"`:""}${val?` data-v="${esc(val)}"`:""}>
      <span class="accname">${esc(name)}</span>
      ${count?`<span class="count">${count}</span>`:""}
      <span class="accmeta${metaHas?" has":""}">${meta}</span>
      <span class="chev">${CHEV}</span>
    </button>${open?`<div class="accbody">${body}</div>`:""}</div>`;
}

function itemBlock(v,i){
  const multi = state.items.length>1, t = itemTotal(v);
  const half = CFG.fields.filter(f=>f.half), rest = CFG.fields.filter(f=>!f.half);
  const fieldInput = f => `<div class="field"><label class="f" for="${f.k}${v.id}">${esc(f.label)}</label>
    <input type="text" id="${f.k}${v.id}" ${f.numeric?'inputmode="numeric"':''}${f.max?` maxlength="${f.max}"`:''}
      placeholder="${esc(f.ph||"")}" value="${esc(v.vals[f.k]||"")}" data-item="${i}" data-k="${esc(f.k)}"></div>`;

  const details = `
    ${half.length?`<div class="row">${half.map(fieldInput).join("")}</div>`:""}
    ${rest.map(fieldInput).join("")}
    ${CFG.conditions.length?`<div class="field"><label class="f">${esc(CFG.conditionQ)}</label><div class="chips">${CFG.conditions.map(c=>`
      <button class="chip" aria-pressed="${v.condition===c.id}" data-act="cond" data-i="${i}" data-v="${esc(c.id)}">${esc(c.label)}${c.hint?`<small>${esc(c.hint)}</small>`:""}</button>`).join("")}</div></div>`:""}
    ${CFG.frequencies.length?`<div class="field" style="margin-bottom:0"><label class="f">${esc(CFG.frequencyQ)}</label><div class="chips">${CFG.frequencies.map(f=>`
      <button class="chip" aria-pressed="${v.frequency===f.id}" data-act="freq" data-i="${i}" data-v="${esc(f.id)}">${esc(f.label)}</button>`).join("")}</div></div>`:""}
    ${multi?`<div style="text-align:right;margin-top:14px"><button class="remove" data-act="rmitem" data-i="${i}">Remove this ${esc(TRADES[CFG.trade]?.item||"item")}</button></div>`:""}`;

  const cats = categories().map(cat=>{
    const ct = catTotal(v,cat), open = v.openCats.includes(cat);
    const body = CFG.services.filter(s=>s.cat===cat).map(s=>{
      const p=priceFor(s,v), on=v.services.includes(s.name);
      const incl=(Array.isArray(s.includes)?s.includes:[]).map(x=>String(x).trim()).filter(Boolean);
      const brief=s.desc || (incl.length?incl.slice(0,3).join(" · ")+(incl.length>3?" + "+(incl.length-3)+" more":""):"");
      const info=openInfo.has(s.name);
      const pic=/^https:\/\//i.test(s.photo||"")?`<span class="svcpic"><img src="${esc(s.photo)}" alt="" loading="lazy"></span>`:"";
      const flag=s.popular?`<span class="pop">Most popular</span>`:"";
      return `<button class="svc${s.popular?" hasflag":""}" aria-pressed="${on}" data-act="svc" data-i="${i}" data-v="${esc(s.name)}">
        ${flag}${pic}
        <span class="pkgtop"><span class="box">${CHECK}</span>
        <span class="pkgmain"><span class="svcname">${esc(s.name)}</span><span class="svcprice">${p.open?"<small>from</small>"+money(p.low):(p.low===p.high?money(p.low):money(p.low)+"–"+money(p.high))}</span>${brief?`<span class="svcdesc">${esc(brief)}</span>`:""}${incl.length?`<span class="svcmore" data-act="info" data-i="${i}" data-v="${esc(s.name)}">${info?"Hide details":"What's included"} <span class="svcchev${info?" up":""}">▾</span></span>`:""}${info?`<span class="svcincl">${incl.map(x=>`<span class="svcli">${esc(x)}</span>`).join("")}<span class="svcwhy">Price depends on your vehicle's size and condition. We confirm the final price after reviewing your request.</span></span>`:""}</span></span></button>`;
    }).join("");
    return accordion({ open, name:cat, count:ct.n||0,
      meta: ct.n ? totText(ct) : "from "+money(catFrom(v,cat)),
      metaHas:!!ct.n, body, act:"togglecat", i, val:cat });
  }).join("");

  const at = addonTotal(v);
  const addonBody = CFG.addons.map(a=>{
    const on=v.addons.includes(a.name);
    return `<button class="svc" aria-pressed="${on}" data-act="addon" data-i="${i}" data-v="${esc(a.name)}">
      <span class="box">${CHECK}</span>
      <span style="flex:1;min-width:0"><span class="svcname">${esc(a.name)}</span>${a.desc?`<span class="svcdesc">${esc(a.desc)}</span>`:""}</span>
      <span class="svcprice">+${money(a.price)}</span></button>`;
  }).join("");

  const veh = CFG.trade==="detailing";
  const sizePick = CFG.sizes.length>1 ? `<div class="qhead" style="margin-top:${i?26:6}px">${veh?"What are you driving?":"Pick your size"}${multi?` <span style="color:var(--muted);font-weight:700;font-size:15px">· ${esc(itemLabel(v,i))}</span>`:""}</div>
    <div class="vpick">${CFG.sizes.map((s,n)=>`
      <button class="vcard plain" aria-pressed="${v.size===s.id && !state.other}" data-act="size" data-i="${i}" data-v="${esc(s.id)}">
        <span><b>${esc(s.label)}</b>${s.hint?`<small>${esc(s.hint)}</small>`:""}</span></button>`).join("")}
      ${veh && i===0 ? `<button class="vcard plain" style="grid-column:1/-1" aria-pressed="${state.other}" data-act="other"><span><b>Something else</b><small>Motorcycle, boat, RV, trailer</small></span></button>` : ""}</div>` : "";
  const otherBox = `<div class="acc on" style="margin-top:14px;padding:18px"><div class="field" style="margin-bottom:0"><label class="f" for="copen">Tell us what you have and what you need</label>
      <textarea id="copen" placeholder="Example: 24 ft boat, full detail and ceramic coating." data-open="1">${esc(state.openReq)}</textarea>
      <div class="hint" style="margin-top:8px">No price needed. Add your details below and we'll send you a quote.</div></div></div>`;
  if (state.other && i===0) return sizePick + otherBox;

  return `${sizePick}
    <div style="height:14px"></div>
    ${accordion({ open:v.detailsOpen, name:itemLabel(v,i), count:0,
      meta: t.low ? totText(t) : "Add details", metaHas:!!t.low,
      body:details, act:"toggleitem", i })}
    <div class="qhead">Choose your package</div>
    <p class="qsub">Tap a package to add it. Your price updates as you go.</p>
    ${cats}
    ${CFG.addons.length?accordion({ open:v.openCats.includes("__addons"), name:"Add-Ons", count:at.n||0,
      meta: at.n ? "+"+money(at.low) : "from "+money(Math.min(...CFG.addons.map(a=>Number(a.price)||0))),
      metaHas:!!at.n, body:addonBody, act:"togglecat", i, val:"__addons" }):""}`;
}

function contactFooter(){
  const p = digits(B().phone);
  const pills = [
    p && `<a class="pill" href="tel:${esc(p)}">${ICON.phone} Call</a>`,
    p && `<a class="pill" href="sms:${esc(p)}">${ICON.chat} Text</a>`,
    B().email && `<a class="pill" href="mailto:${esc(B().email)}">${ICON.mail} Email</a>`,
  ].filter(Boolean).join("");
  const socials = Object.keys(SOCIAL).filter(k=>B()[k]).map(k=>
    `<a class="soc" href="${esc(normUrl(B()[k]))}" target="_blank" rel="noopener" aria-label="${SOCIAL[k].label}">
      <svg width="19" height="19" viewBox="0 0 24 24">${SOCIAL[k].icon}</svg></a>`).join("");
  if (!pills && !socials) return "";
  return `<div class="cfoot">
    <div class="cfhead"><div class="cfmark">${B().logo?`<img src="${esc(B().logo)}" alt="">`:PEAK}</div>
      <div><div class="cfname">${esc(B().name)}</div>${B().tagline?`<div class="cftag">${esc(B().tagline)}</div>`:""}</div></div>
    ${pills?`<div class="pills">${pills}</div>`:""}
    ${socials?`<div class="socs">${socials}</div>`:""}</div>`;
}

function briefOf(s){
  const incl=(Array.isArray(s.includes)?s.includes:[]).map(x=>String(x).trim()).filter(Boolean);
  return s.desc || (incl.length?incl.slice(0,3).join(" · ")+(incl.length>3?" + "+(incl.length-3)+" more":""):"");
}

function pickedSummary(){
  if (state.other) return "";
  return state.items.map((v,i)=>{
    const rows=[...v.services.map(n=>{const s=CFG.services.find(x=>x.name===n); if(!s)return"";
        const p=priceFor(s,v), incl=(Array.isArray(s.includes)?s.includes:[]).map(x=>String(x).trim()).filter(Boolean);
        return `<div class="pk"><div class="pkh"><span>${esc(n)}</span><b>${p.open?"from "+money(p.low):(p.low===p.high?money(p.low):money(p.low)+"–"+money(p.high))}</b></div>${s.desc?`<div class="pkd">${esc(s.desc)}</div>`:""}${incl.length?`<ul class="pkl">${incl.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}</div>`;}),
      ...v.addons.map(n=>{const a=CFG.addons.find(x=>x.name===n); if(!a)return"";
        return `<div class="pk"><div class="pkh"><span>${esc(n)}</span><b>+${money(a.price)}</b></div>${a.desc?`<div class="pkd">${esc(a.desc)}</div>`:""}</div>`;})].join("");
    return rows?`<div class="vlabel">${esc(itemLabel(v,i))}</div>${rows}`:"";
  }).join("");
}

function stepsBar(picked){
  const now = !(picked || hasOpen()) ? 0 : !contactReady() ? 1 : 2;
  return `<div class="steps" aria-label="Progress">${[CFG.copy.step1, "Your details", "Send"].map((l,n)=>
    `<div class="stp${n<now?" done":n===now?" now":""}"><i></i><span>${esc(l)}</span></div>`).join("")}</div>`;
}

function formScreen(){
  const t = grandTotal(), picked = anyPicked(), c = CFG.copy;
  const cond = CFG.conditions.find(x=>x.id===state.items[0]?.condition);
  return `
  <h1>${esc(c.headline)}</h1>
  ${c.sub?`<p class="lede">${esc(c.sub)}</p>`:""}
  ${picked?`<div class="hero">
    <div class="herolabel">Your estimate</div>
    <div class="heroval">${totText(t)}</div>
    ${cond?`<div class="herosub">Based on a ${esc(cond.label.toLowerCase())} job. Change that and this moves with it.</div>`:""}
  </div>`:""}

  ${stepsBar(picked)}
  ${state.other ? itemBlock(state.items[0],0) : state.items.map(itemBlock).join("")}
  ${state.other?"":`<button class="ghost" data-act="additem" style="margin-top:14px">+ Add another ${esc(TRADES[CFG.trade]?.item||"item")}</button>`}

  ${vehMode()?"":`<div style="margin-top:14px">${accordion({ open:state.openOpen, name:"Something else?", count:0,
    meta: hasOpen() ? "Added" : "Ask us", metaHas:hasOpen(), act:"toggleopen",
    body:`<div class="field" style="margin-bottom:0"><label class="f" for="copen">Another vehicle, a different service, or a question</label>
      <textarea id="copen" placeholder="Example: I also have a boat and want a price on a full detail." data-open="1">${esc(state.openReq)}</textarea>
      <div class="hint" style="margin-top:8px">No price needed. Add your details below and we'll reply with a quote.</div></div>` })}</div>`}

  <div class="qhead">${esc(c.step2)}</div>
  ${accordion({ open:state.contactOpen, name:"Your details", count:0,
    meta: contactReady()?esc(state.contact.name):"Tap to fill in", metaHas:contactReady(), act:"togglecontact",
    body:`<div class="field"><label class="f" for="cname">Your name</label>
      <input type="text" id="cname" placeholder="John Doe" value="${esc(state.contact.name)}" data-c="name"></div>
    <div class="row">
      <div class="field"><label class="f" for="cphone">Phone</label>
        <input type="tel" id="cphone" placeholder="(555) 012-3456" value="${esc(state.contact.phone)}" data-c="phone"></div>
      <div class="field"><label class="f" for="cemail">Email</label>
        <input type="email" id="cemail" placeholder="you@email.com" value="${esc(state.contact.email)}" data-c="email"></div>
    </div>
    <div class="field"><label class="f" for="caddr">Address <span style="color:var(--dim);font-weight:500">(optional)</span></label>
      <input type="text" id="caddr" placeholder="Street, city" value="${esc(state.contact.address)}" data-c="address"></div>
    <div class="field" style="margin-bottom:0"><label class="f" for="cnotes">Anything we should know? <span style="color:var(--dim);font-weight:500">(optional)</span></label>
      <textarea id="cnotes" placeholder="Anything that helps us price it right…" data-c="notes">${esc(state.contact.notes)}</textarea></div>
    ${CFG.autoReply && CFG.autoReply.sms ? `<label class="consent"><input type="checkbox" data-consent="1"${state.smsConsent?" checked":""}>
      <span>Text me a confirmation and updates about this request. Msg &amp; data rates may apply. Reply STOP to opt out.</span></label>`:""}
    ${state.touched && !contactReady()?`<div class="err">Add your name and a phone number or email so we can reply.</div>`:""}` })}

  ${picked?`<div class="acc on" style="padding:18px;margin-top:16px">
    <div class="secnum" style="margin:0 0 2px">What you're requesting</div>
    ${pickedSummary()}
    <div class="pkt"><span>Estimated total</span><b>${totText(t)}</b></div></div>`:""}

  ${state.sendError?`<div class="err" style="margin:14px 0 0">${esc(state.sendError)}</div>`:""}
  <div class="note"><b>${esc(c.disclaimerTitle)}</b> ${esc(B().name)} ${esc(c.disclaimer)}</div>
  ${contactFooter()}
  <footer><span class="pwr">Powered by ${ATLASMARK} <b>Atlas</b></span></footer>`;
}

function doneScreen(){
  const t = grandTotal();
  return `<div style="text-align:center;padding:30px 0 10px">
    <div class="tick"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.2 5.2L20 7"/></svg></div>
    <h1 style="margin:0 0 10px">Request sent</h1>
    <p class="lede" style="margin:0 0 22px">${esc(B().name)} will get back to you ${esc(B().replyWindow)}.<br>
      Need it sooner? Call or text ${esc(B().phone)}.</p></div>
  ${anyPicked()?`<div class="hero"><div class="herolabel">Your estimate</div>
    <div class="heroval">${totText(t)}</div>
    <div class="herosub">Final price confirmed once they see it in person.</div></div>`:""}
  <div class="acc on" style="padding:18px">
    <div class="secnum" style="margin:0 0 4px">What you asked for</div>
    ${pickedSummary()}
    ${hasOpen()?`<div class="vlabel">Your question</div><div class="pkd" style="white-space:pre-wrap">${esc(state.openReq.trim())}</div>`:""}</div>
  <div class="note">Saved to ${esc(B().name)}'s Atlas inbox with your details, so they already know
    what they're looking at before they call.</div>
  ${contactFooter()}
  <footer><span class="pwr">Powered by ${ATLASMARK} <b>Atlas</b></span></footer>`;
}

// ============================================================== OWNER SIDE
// Up/down controls, same idea as the reordering in Quick Quote Pro. Disabled
// at the ends so you can't shuffle something off the list.
const UP = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>';
const DOWN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const arrows = (act, i, first, last, extra) => `<span class="mv">
  <button class="mvb" data-act="${act}" data-i="${i}" data-d="-1"${extra||""} ${first?"disabled":""} aria-label="Move up">${UP}</button>
  <button class="mvb" data-act="${act}" data-i="${i}" data-d="1"${extra||""} ${last?"disabled":""} aria-label="Move down">${DOWN}</button></span>`;

function moveBy(arr, i, d){
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

const tabBtn = (id,label) => `<button class="tab" aria-pressed="${editor.tab===id}" data-act="tab" data-v="${id}">${label}</button>`;
const efield = (label,key,val,ph,type) => `<div class="field"><label class="f">${esc(label)}</label>
  <input type="${type||"text"}" value="${esc(val||"")}" data-e="${esc(key)}" placeholder="${esc(ph||"")}"></div>`;

function brandTab(){
  return `
    <div class="field"><label class="f">Your logo</label>
      <div class="logorow">
        <div class="logoprev">${B().logo?`<img src="${esc(B().logo)}" alt="">`:PEAK}</div>
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          <span class="btn filebtn">Upload<input type="file" accept="image/*" id="logofile"></span>
          ${B().logo?`<button class="btn" data-act="clearlogo">Remove</button>`:""}
        </div>
      </div>
      <div class="hint">Square works best. Resized to 256px and stored on this device.</div>
    </div>
    ${efield("Business name","brand.name",B().name)}
    ${efield("Small line above the name","brand.kick",B().kick,"Free Estimate")}
    ${efield("Tagline","brand.tagline",B().tagline)}
    ${efield("Phone","brand.phone",B().phone,"","tel")}
    ${efield("Email","brand.email",B().email,"","email")}
    ${efield("How fast you reply","brand.replyWindow",B().replyWindow,"within 1 business hour")}
    <div class="field"><label class="f">Accent colour</label><div class="swatches">${ACCENTS.map(c=>`
      <button class="sw" style="background:${c}" aria-pressed="${B().accent.toLowerCase()===c.toLowerCase()}" data-act="accent" data-v="${c}" aria-label="${c}"></button>`).join("")}
      <label class="sw custom" aria-label="Custom colour" style="background:${esc(B().accent)}">
        <input type="color" value="${esc(B().accent)}" data-act="accentpick"></label></div></div>

    <div class="field"><label class="f">Background</label>
      <div class="swatches">${Object.entries(THEMES).map(([id,t])=>`
        <button class="sw theme" aria-pressed="${B().theme===id}" data-act="theme" data-v="${id}"
          style="background:${t.bg};border-color:${t.line}" title="${t.label}" aria-label="${t.label}">
          <span style="background:${t.text}"></span></button>`).join("")}</div>
      <div class="hint" style="margin-top:7px">${Object.values(THEMES).map(t=>t.label).join(" · ")}</div>
    </div>

    <div class="field"><label class="f">Hex pattern</label>
      <div class="chips">${Object.entries(PATTERNS).map(([id,p])=>`
        <button class="chip" aria-pressed="${B().pattern===id}" data-act="pattern" data-v="${id}">${p.label}</button>`).join("")}</div>
    </div>
    <div class="field"><label class="f">Social links <span style="color:var(--dim);font-weight:500">(optional)</span></label>
      ${Object.keys(SOCIAL).map(k=>`<input type="text" style="margin-bottom:9px" value="${esc(B()[k])}" data-e="brand.${k}" placeholder="${SOCIAL[k].label}">`).join("")}</div>
    <div class="locked">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex:none;margin-top:1px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <div><b style="color:var(--muted)">Powered by Atlas</b> stays on the page. Everything else is yours.</div>
    </div>`;
}

function svcArrows(s, i){
  const sameCat = CFG.services.map((x,n)=>x.cat===s.cat?n:-1).filter(n=>n>=0);
  const pos = sameCat.indexOf(i);
  return arrows("mvsvc", i, pos===0, pos===sameCat.length-1);
}

function servicesTab(){
  const rowFor = (s,i) => {
    const open = editor.openSvc===i;
    return `<div class="erow${open?" on":""}">
      <button class="erowhead" data-act="opensvc" data-i="${i}">
        <span><span class="erowname">${esc(s.name||"Untitled")}</span><span class="erowcat">${esc(s.cat||"No category")}</span></span>
        <span class="erowprice">${money(Number(s.car?.[0])||0)}${s.car?.[1]?"–"+money(s.car[1]):"+"}</span>
        <span class="chev">${CHEV}</span></button>
      ${svcArrows(s,i)}
      ${open?`<div class="erowbody">
        ${efield("Category","services."+i+".cat",s.cat,"Maintenance")}
        ${efield("Service name","services."+i+".name",s.name)}
        <div class="field"><label class="f">Short description</label>
          <textarea data-e="services.${i}.desc" style="min-height:62px">${esc(s.desc||"")}</textarea></div>
        <div class="pricegrid">
          <div><div class="plab">${esc(CFG.sizes[0]?.label||"Tier 1")}</div>
            <div class="row"><input type="text" inputmode="decimal" value="${esc(s.car?.[0]??"")}" data-e="services.${i}.car.0" placeholder="Low">
              <input type="text" inputmode="decimal" value="${esc(s.car?.[1]??"")}" data-e="services.${i}.car.1" placeholder="High"></div></div>
          <div><div class="plab">${esc(CFG.sizes[1]?.label||"Tier 2")}</div>
            <div class="row"><input type="text" inputmode="decimal" value="${esc(s.suv?.[0]??"")}" data-e="services.${i}.suv.0" placeholder="Low">
              <input type="text" inputmode="decimal" value="${esc(s.suv?.[1]??"")}" data-e="services.${i}.suv.1" placeholder="High"></div></div>
        </div>
        <div class="hint">Leave High blank to show “from $X” instead of a range.</div>
        <button class="btn danger" data-act="rmsvc" data-i="${i}" style="margin-top:12px">${ICON.trash} Delete service</button>
      </div>`:""}</div>`;
  };

  const addons = CFG.addons.map((a,i)=>`<div class="arow">
      <input type="text" value="${esc(a.name)}" data-e="addons.${i}.name" placeholder="Add-on name">
      <input type="text" inputmode="decimal" value="${esc(a.price)}" data-e="addons.${i}.price" placeholder="0" style="max-width:92px">
      ${arrows("mvaddon", i, i===0, i===CFG.addons.length-1)}<button class="iconbtn" data-act="rmaddon" data-i="${i}" aria-label="Delete">${ICON.trash}</button></div>
      <textarea data-e="addons.${i}.desc" placeholder="Full description customers see for this add-on" style="min-height:62px;margin:-2px 0 14px">${esc(a.desc||"")}</textarea>`).join("");

  // Grouped the same way the customer sees them, so adding a service puts it
  // in a category instead of dropping it at the bottom of one long list.
  const grouped = categories().map(cat=>`
    <div class="egroup">
      <div class="egrouphead">
        <span class="egroupname">${esc(cat)}</span>
        <span class="egroupcount">${CFG.services.filter(s=>s.cat===cat).length}</span>
        ${arrows("mvcat", categories().indexOf(cat), categories().indexOf(cat)===0, categories().indexOf(cat)===categories().length-1)}
      </div>
      ${CFG.services.map((s,i)=>s.cat===cat?rowFor(s,i):"").join("")}
      <button class="ghost small" data-act="addsvc" data-v="${esc(cat)}">+ Add to ${esc(cat)}</button>
    </div>`).join("");

  const orphans = CFG.services.map((s,i)=>!s.cat?rowFor(s,i):"").join("");

  return `<div class="hint" style="margin-bottom:14px">These are your categories. Customers see them in this order, with the services underneath.</div>
    ${grouped}
    ${orphans?`<div class="egroup"><div class="egrouphead"><span class="egroupname">No category</span></div>${orphans}</div>`:""}
    <button class="ghost" data-act="addcat" style="margin-top:4px">+ Add a category</button>
    <div class="f" style="margin:22px 0 9px">Add-ons</div>
    ${addons}
    <button class="ghost" data-act="addaddon" style="margin-top:4px">+ Add an add-on</button>`;
}

function questionsTab(){
  const conds = CFG.conditions.map((c,i)=>`<div class="arow">
      <input type="text" value="${esc(c.label)}" data-e="conditions.${i}.label" placeholder="Level">
      <input type="text" value="${esc(c.hint||"")}" data-e="conditions.${i}.hint" placeholder="Hint">
      ${arrows("mvcond", i, i===0, i===CFG.conditions.length-1)}<button class="iconbtn" data-act="rmcond" data-i="${i}" aria-label="Delete">${ICON.trash}</button></div>`).join("");
  const freqs = CFG.frequencies.map((f,i)=>`<div class="arow">
      <input type="text" value="${esc(f.label)}" data-e="frequencies.${i}.label" placeholder="Option">
      <input type="text" inputmode="decimal" value="${esc(f.uplift)}" data-e="frequencies.${i}.uplift" placeholder="0" style="max-width:74px">
      <span class="pct">%</span>
      ${arrows("mvfreq", i, i===0, i===CFG.frequencies.length-1)}<button class="iconbtn" data-act="rmfreq" data-i="${i}" aria-label="Delete">${ICON.trash}</button></div>`).join("");
  const fields = CFG.fields.map((f,i)=>`<div class="arow">
      <input type="text" value="${esc(f.label)}" data-e="fields.${i}.label" placeholder="Label">
      <input type="text" value="${esc(f.ph||"")}" data-e="fields.${i}.ph" placeholder="Example">
      ${arrows("mvfield", i, i===0, i===CFG.fields.length-1)}<button class="iconbtn" data-act="rmfield" data-i="${i}" aria-label="Delete">${ICON.trash}</button></div>`).join("");

  return `
    <div class="field"><label class="f">Trade</label>
      <div class="chips">${Object.entries(TRADES).map(([id,t])=>`
        <button class="chip" aria-pressed="${CFG.trade===id}" data-act="trade" data-v="${id}">${esc(t.label)}</button>`).join("")}</div>
      <div class="hint" style="margin-top:8px">Switching trade replaces the questions, size tiers and starting catalog below.</div>
    </div>

    <div class="f" style="margin:20px 0 9px">What you ask them for</div>
    ${fields}
    <button class="ghost" data-act="addfield">+ Add a field</button>

    <div class="f" style="margin:20px 0 4px">Your two size tiers</div>
    <div class="hint" style="margin-bottom:9px">Every service has a price for each of these. Name them however you price.</div>
    <div class="row">${efield("Smaller","sizes.0.label",CFG.sizes[0]?.label)}
      ${efield("Bigger","sizes.1.label",CFG.sizes[1]?.label)}</div>

    <div class="f" style="margin:22px 0 4px">The "how big a job" question</div>
    ${efield("Question wording","conditionQ",CFG.conditionQ)}
    <div class="hint" style="margin-bottom:9px">Each level is an answer button. Left box is the label, right box is the small print under it.</div>
    ${conds}
    <button class="ghost" data-act="addcond">+ Add a level</button>
    <div class="hint" style="margin-top:8px">Levels run cheapest to dearest. The first sits at the bottom of your price band, the last at the top.</div>

    <div class="f" style="margin:20px 0 9px">Timing question</div>
    ${efield("Question wording","frequencyQ",CFG.frequencyQ)}
    ${freqs}
    <button class="ghost" data-act="addfreq">+ Add an option</button>
    <div class="hint" style="margin-top:8px">The % only ever raises the top of the range, never the bottom.</div>

    <div class="f" style="margin:22px 0 9px">Page wording</div>
    ${efield("Headline","copy.headline",CFG.copy.headline)}
    <div class="field"><label class="f">Line under the headline</label>
      <textarea data-e="copy.sub" style="min-height:70px">${esc(CFG.copy.sub)}</textarea></div>
    ${efield("Step 1 label","copy.step1",CFG.copy.step1)}
    ${efield("Step 2 label","copy.step2",CFG.copy.step2)}`;
}

function editorSheet(){
  if (!editor.open) return "";
  const body = editor.tab==="brand" ? brandTab() : editor.tab==="services" ? servicesTab() : questionsTab();
  return `<div class="modal" id="modalbg"><div class="sheet" role="dialog" aria-label="Customize">
    <div class="sheethead">
      <div class="sheettitle">Customize</div>
      <button class="x" data-act="closeedit" aria-label="Close">&times;</button>
    </div>
    <div class="tabs">${tabBtn("brand","Brand")}${tabBtn("services","Services")}${tabBtn("questions","Questions")}</div>
    <div class="tabbody">${body}</div>
    <div style="display:flex;gap:10px;margin-top:18px">
      <button class="btn" data-act="resetall">Reset all</button>
      <button class="btn primary" data-act="closeedit" style="flex:1">Done</button>
    </div></div></div>`;
}

// ---------------------------------------------------------------- render
function render(){
  applyBrand();
  applyAppIdentity();
  document.getElementById("mark").innerHTML = B().logo
    ? `<img src="${esc(B().logo)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : PEAK;
  document.getElementById("bizkick").textContent = B().kick;
  document.getElementById("bizname").textContent = B().name;
  document.getElementById("app").innerHTML = state.screen==="form" ? formScreen() : doneScreen();
  document.getElementById("modal").innerHTML = editorSheet();

  const bar = document.getElementById("bar");
  if (state.screen!=="form"){ bar.hidden = true; return; }
  bar.hidden = false;
  const t = grandTotal();
  document.getElementById("totval").textContent = totShown();
  const cta = document.getElementById("cta");
  cta.disabled = !canSend();
  cta.textContent = ctaText();
}

// ---------------------------------------------------------------- events
function setPath(path, value){
  const parts = path.split(".");
  let o = CFG;
  for (let i=0;i<parts.length-1;i++) o = o[parts[i]];
  o[parts.at(-1)] = value;
}
const toggle = (arr,val) => { const i=arr.indexOf(val); if(i===-1) arr.push(val); else arr.splice(i,1); };

document.addEventListener("click", e=>{
  const b = e.target.closest("[data-act]"); if(!b) return;
  const act=b.dataset.act, i=Number(b.dataset.i), val=b.dataset.v, v=state.items[i];

  // customer side
  if(act==="additem"){ state.items.push(newItem(true)); render(); window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"}); return; }
  if(act==="rmitem"){ state.items.splice(i,1); render(); return; }
  if(act==="toggleitem"){ v.detailsOpen=!v.detailsOpen; render(); return; }
  if(act==="togglecat"){ toggle(v.openCats,val); render(); return; }
  if(act==="togglecontact"){ state.contactOpen=!state.contactOpen; render(); return; }
  if(act==="toggleopen"){ state.openOpen=!state.openOpen; render(); return; }
  if(act==="size"){ state.other=false; v.size=val; render(); return; }
  if(act==="other"){ state.other=true; render(); const el=document.getElementById("copen"); if(el) el.focus({preventScroll:true}); return; }
  if(act==="cond"){ v.condition=val; render(); return; }
  if(act==="freq"){ v.frequency=val; render(); return; }
  if(act==="info"){ e.stopPropagation(); if(openInfo.has(val)) openInfo.delete(val); else openInfo.add(val); render(); return; }
  if(act==="svc"){ toggle(v.services,val); render(); return; }
  if(act==="addon"){ toggle(v.addons,val); render(); return; }

  // owner side
  if(act==="closeedit"){ editor.open=false; saveConfig(); render(); return; }
  if(act==="tab"){ editor.tab=val; editor.openSvc=null; render(); return; }
  if(act==="accent"){ B().accent=val; saveConfig(); render(); return; }
  if(act==="theme"){ B().theme=val; saveConfig(); render(); return; }
  if(act==="pattern"){ B().pattern=val; saveConfig(); render(); return; }
  if(act==="clearlogo"){ B().logo=""; saveConfig(); render(); return; }
  if(act==="opensvc"){ editor.openSvc = editor.openSvc===i ? null : i; render(); return; }
  if(act==="addsvc"){ CFG.services.push({ cat:val||categories()[0]||"Services", name:"New service", desc:"", car:[100,150], suv:[120,180] });
    editor.openSvc=CFG.services.length-1; saveConfig(); render(); return; }
  if(act==="mvsvc"){ const d=Number(b.dataset.d), cur=CFG.services[i];
    const same=CFG.services.map((x,n)=>x.cat===cur.cat?n:-1).filter(n=>n>=0);
    const pos=same.indexOf(i), target=same[pos+d];
    if(target!==undefined){ const tmp=CFG.services[i]; CFG.services[i]=CFG.services[target]; CFG.services[target]=tmp;
      if(editor.openSvc===i) editor.openSvc=target; else if(editor.openSvc===target) editor.openSvc=i; }
    saveConfig(); render(); return; }
  if(act==="mvcat"){ const d=Number(b.dataset.d), cats=categories();
    const from=cats[i], to=cats[i+d];
    if(to){ // categories are only an order of appearance, so swap the blocks
      const block=c=>CFG.services.filter(x=>x.cat===c);
      const rest=CFG.services.filter(x=>x.cat!==from && x.cat!==to);
      const order=cats.slice(); [order[i],order[i+d]]=[order[i+d],order[i]];
      CFG.services=order.flatMap(c=>c===from||c===to?block(c):block(c)).concat(rest.filter(x=>!cats.includes(x.cat)));
      editor.openSvc=null; }
    saveConfig(); render(); return; }
  if(act==="mvaddon"){ moveBy(CFG.addons,i,Number(b.dataset.d)); saveConfig(); render(); return; }
  if(act==="mvcond"){ moveBy(CFG.conditions,i,Number(b.dataset.d)); normaliseBands(); saveConfig(); render(); return; }
  if(act==="mvfreq"){ moveBy(CFG.frequencies,i,Number(b.dataset.d)); saveConfig(); render(); return; }
  if(act==="mvfield"){ moveBy(CFG.fields,i,Number(b.dataset.d)); saveConfig(); render(); return; }
  if(act==="addcat"){ let n=1, name="New category";
    while(categories().includes(name)) name = "New category "+(++n);
    CFG.services.push({ cat:name, name:"New service", desc:"", car:[100,150], suv:[120,180] });
    editor.openSvc=CFG.services.length-1; saveConfig(); render(); return; }
  if(act==="rmsvc"){ const gone=CFG.services[i].name; CFG.services.splice(i,1);
    state.items.forEach(x=>{ const j=x.services.indexOf(gone); if(j>-1) x.services.splice(j,1); });
    editor.openSvc=null; saveConfig(); render(); return; }
  if(act==="addaddon"){ CFG.addons.push({ name:"New add-on", price:50, desc:"" }); saveConfig(); render(); return; }
  if(act==="rmaddon"){ const gone=CFG.addons[i].name; CFG.addons.splice(i,1);
    state.items.forEach(x=>{ const j=x.addons.indexOf(gone); if(j>-1) x.addons.splice(j,1); });
    saveConfig(); render(); return; }
  if(act==="addcond"){ CFG.conditions.push({ id:"c"+Date.now().toString(36), label:"New level", hint:"", lo:.5, hi:1 }); saveConfig(); render(); return; }
  if(act==="rmcond"){ if(CFG.conditions.length>0){ CFG.conditions.splice(i,1); normaliseBands(); saveConfig(); render(); } return; }
  if(act==="addfreq"){ CFG.frequencies.push({ id:"f"+Date.now().toString(36), label:"New option", uplift:0 }); saveConfig(); render(); return; }
  if(act==="rmfreq"){ if(CFG.frequencies.length>0){ CFG.frequencies.splice(i,1); saveConfig(); render(); } return; }
  if(act==="addfield"){ CFG.fields.push({ k:"f"+Date.now().toString(36), label:"New question", ph:"" }); saveConfig(); render(); return; }
  if(act==="rmfield"){ if(CFG.fields.length>1){ CFG.fields.splice(i,1); saveConfig(); render(); } return; }
  if(act==="trade"){ const keepBrand=structuredClone(CFG.brand);
    CFG=seedFromTrade(val); CFG.brand=keepBrand; state.items=[newItem(false)];
    saveConfig(); render(); return; }
  if(act==="resetall"){ const keepBrand=structuredClone(CFG.brand);
    CFG=seedFromTrade(CFG.trade); CFG.brand=keepBrand; state.items=[newItem(false)];
    editor.openSvc=null; saveConfig(); render(); return; }
});

// Levels are read as a ladder from cheapest to dearest, so after one is removed
// the remaining ones have to be re-spread or there'd be a gap in the band.
function normaliseBands(){
  const n = CFG.conditions.length;
  CFG.conditions.forEach((c,i)=>{ c.lo = i/n; c.hi = (i+1)/n; });
}

document.getElementById("gear").addEventListener("click", ()=>{ editor.open=true; render(); });
document.addEventListener("click", e=>{ if(e.target.id==="modalbg"){ editor.open=false; saveConfig(); render(); } });

document.addEventListener("input", e=>{
  const el=e.target;
  if(el.dataset.item!==undefined){ state.items[Number(el.dataset.item)].vals[el.dataset.k]=el.value; return; }
  if(el.dataset.c){ state.contact[el.dataset.c]=el.value; return; }
  if(el.dataset.open!==undefined){
    state.openReq=el.value;
    document.getElementById("cta").disabled = !canSend();
    document.getElementById("totval").textContent = totShown();
    return; }
  if(el.dataset.consent!==undefined){ state.smsConsent=el.checked; return; }
  if(el.dataset.e){
    const path=el.dataset.e;
    // Prices and the frequency % are numbers; a blank high price means "from $X".
    const numeric = /\.(car|suv)\.\d$|\.uplift$|\.price$/.test(path);
    setPath(path, numeric ? (el.value.trim()==="" ? null : num(el.value)) : el.value);
    saveConfig();
    // Repaint only what the customer sees, so the field being typed in keeps focus.
    if (state.screen==="form") {
      const t=grandTotal();
      document.getElementById("totval").textContent = totText(t);
      if (path==="brand.name") document.getElementById("bizname").textContent = el.value;
      if (path==="brand.kick") document.getElementById("bizkick").textContent = el.value;
    }
  }
});

document.addEventListener("input", e=>{
  if(e.target.dataset.act!=="accentpick") return;
  B().accent = e.target.value; applyBrand(); saveConfig();
});

document.addEventListener("change", e=>{
  if(e.target.dataset.act==="accentpick"){ render(); return; }
  if(e.target.id!=="logofile") return;
  const file=e.target.files && e.target.files[0]; if(!file) return;
  const fr=new FileReader();
  fr.onload=()=>{ const img=new Image();
    img.onload=()=>{ const S=256,c=document.createElement("canvas");c.width=c.height=S;
      const x=c.getContext("2d"), s=Math.min(img.width,img.height);
      x.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,S,S);
      B().logo=c.toDataURL("image/jpeg",.88); saveConfig(); render(); };
    img.src=fr.result; };
  fr.readAsDataURL(file);
});

document.getElementById("cta").addEventListener("click", ()=>{
  state.touched = true;
  if(!canSend()) return;
  if(anyPicked()) state.items = state.items.filter(v=>v.services.length||v.addons.length);
  if(!contactReady()){ state.contactOpen=true; render();    const el=document.getElementById("cname");
    if(el){ el.scrollIntoView({block:"center",behavior:"smooth"}); el.focus(); } return; }
  if(!SLUG){ console.log("ESTIMATE REQUEST", JSON.stringify(payload(), null, 2));
    state.screen="done"; render(); window.scrollTo({top:0}); return; }
  const btn=document.getElementById("cta"); btn.disabled=true; btn.textContent="Sending…";
  fetch(API,{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(hostedPayload()) })
    .then(r=>r.text().then(t=>({ ok:r.ok, j:(()=>{ try{return JSON.parse(t)}catch{return {}} })() })))
    .then(({ok,j})=>{
      if(!ok) throw new Error(j.error||"Something went wrong.");
      state.screen="done"; render(); window.scrollTo({top:0});
    })
    .catch(err=>{ btn.disabled=false; btn.textContent=ctaText();
      state.sendError = (err && err.message) || "Couldn't send. Please call us instead."; render(); });
});

function hostedPayload(){
  return { slug:SLUG, contact:state.contact, sms_consent:!!state.smsConsent, request:hasOpen()?state.openReq.trim():"",
    items: (state.other?[]:state.items).map(v=>({ vals:v.vals, size:v.size, condition:v.condition, frequency:v.frequency,
      services:v.services, addons:v.addons })) };
}

function payload(){
  const t = grandTotal();
  return { trade:CFG.trade, business:B().name, contact:state.contact,
    estimate_low:t.low, estimate_high:t.high,
    items: state.items.map(v=>({ ...v.vals, size_class:v.size==="suv"?"suv_truck_van":"car",
      condition:v.condition, clean_frequency:v.frequency,
      services:v.services, addons:v.addons, range:itemTotal(v) })),
    submitted_at:new Date().toISOString() };
}

if (window.parent !== window) document.body.classList.add("embedded");
if (/[?&]bare=1/.test(location.search) && window.parent !== window) {
  document.body.classList.add("bare");
  const q = new URLSearchParams(location.search), fam = k => (q.get(k)||"").replace(/[^A-Za-z0-9 ]/g,"").trim();
  const body = fam("font"), head = fam("head") || body;
  const fams = [...new Set([body && body+":wght@500;600;700;800", head && head+":wght@600;700;800"].filter(Boolean))];
  if (fams.length) {
    const l = document.createElement("link"); l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?" + fams.map(f => "family=" + f.replace(/ /g,"+")).join("&") + "&display=swap";
    document.head.appendChild(l);
    if (body) document.body.style.setProperty("--ff", `"${body}",sans-serif`);
    if (head) document.body.style.setProperty("--fh", `"${head}",sans-serif`);
  }
  if (/^[0-9a-fA-F]{6}$/.test(q.get("ink")||"")) document.body.style.setProperty("--onaccent", "#"+q.get("ink"));
}
function postHeight(){
  if (window.parent === window) return;
  // scrollHeight can never drop below the iframe's current height, so collapsing a drawer left a
  // blank gap. The body's own box is the real content height.
  const h = Math.ceil(document.body.getBoundingClientRect().height);
  try { window.parent.postMessage({ atlasEstimate:"height", height:h }, "*"); } catch {}
}
new ResizeObserver(postHeight).observe(document.body);
window.addEventListener("load", postHeight);

async function boot(){
  document.getElementById("gear").style.display = "none";
  const app = document.getElementById("app");
  app.innerHTML = '<p class="lede" style="text-align:center;padding:60px 0">Loading…</p>';
  document.getElementById("bar").hidden = true;
  try {
    const r = await fetch(API + "?slug=" + encodeURIComponent(SLUG));
    const j = JSON.parse(await r.text());
    if (!r.ok || !j.config) throw new Error("nf");
    const c = j.config, base = seedFromTrade(c.trade && TRADES[c.trade] ? c.trade : DEFAULTS.trade);
    CFG = { ...base, ...c, brand:{ ...base.brand, ...(c.brand||{}) }, copy:{ ...base.copy, ...(c.copy||{}) } };
    state.items = [newItem(false)];
    render();
  } catch {
    app.innerHTML = '<p class="lede" style="text-align:center;padding:60px 0">This quote page is not available right now.</p>';
  }
}
if (SLUG) boot(); else render();
