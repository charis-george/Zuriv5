const { supabase } = require('./config/supabase');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Initialize Supabase database
const init = async () => {
  try {
    console.log('Initializing Supabase database...');
    
    // Check if demo business exists, if not create it
    const { data: existingBusiness, error: checkError } = await supabase
      .from('businesses')
      .select('id')
      .eq('email', 'demo@zuri.com')
      .limit(1)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error checking demo business:', checkError);
      throw checkError;
    }

    if (!existingBusiness) {
      console.log('Creating demo business...');
      
      const businessId = uuidv4();
      const defaultPassword = bcrypt.hashSync('demo123', 10);

      // Create demo business
      const { error: insertError } = await supabase
        .from('businesses')
        .insert({
          id: businessId,
          name: 'Demo Restaurant',
          email: 'demo@zuri.com',
          password: defaultPassword,
          phone: '+234 123 456 7890',
          address: '123 Demo Street',
          plan: 'zuri_plus'
        });

      if (insertError) {
        console.error('Error creating demo business:', insertError);
        throw insertError;
      }

      console.log('Demo business created');
      
      // Seed demo menu data
      const { seedDemoData } = require('./scripts/seed-demo-data');
      await seedDemoData(businessId);
    } else {
      console.log('Demo business already exists');
      // Ensure demo account is on Zuri Plus
      await supabase
        .from('businesses')
        .update({ plan: 'zuri_plus' })
        .eq('email', 'demo@zuri.com');
    }
    
    console.log('Supabase database initialized successfully');
  } catch (error) {
    console.error('Error initializing Supabase database:', error);
    throw error;
  }
};

const getDb = () => supabase;

module.exports = { init, getDb };
