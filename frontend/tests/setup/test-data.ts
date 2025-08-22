import { createClient } from '@supabase/supabase-js';

// Test Supabase client for data setup
const supabaseUrl = 'http://localhost:54321';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const testSupabase = createClient(supabaseUrl, supabaseKey);

// Test user data
export const testUsers = {
  admin: {
    email: 'admin@test.com',
    password: 'testpassword123',
    profile: {
      username: 'testadmin',
      role: 'admin'
    }
  },
  user: {
    email: 'user@test.com', 
    password: 'testpassword123',
    profile: {
      username: 'testuser',
      role: 'user'
    }
  }
};

// Test event data
export const testEvents = [
  {
    id: 'test-event-1',
    name: 'Test Event 1',
    date: '2024-01-15',
    location: 'Test Location',
    status: 'active'
  },
  {
    id: 'test-event-2', 
    name: 'Test Event 2',
    date: '2024-02-15',
    location: 'Test Location 2',
    status: 'active'
  }
];

// Setup functions
export async function setupTestData() {
  try {
    // Clean existing test data
    await cleanTestData();
    
    // Insert test events
    const { error: eventsError } = await testSupabase
      .from('events')
      .insert(testEvents);
      
    if (eventsError) {
      console.log('Note: Could not insert test events (table might not exist yet):', eventsError.message);
    }
    
    console.log('Test data setup completed');
  } catch (error) {
    console.log('Test data setup encountered an issue:', error);
  }
}

export async function cleanTestData() {
  try {
    // Clean test events
    await testSupabase
      .from('events')
      .delete()
      .ilike('name', 'Test Event%');
      
    // Clean test users (be careful with auth users)
    const { data: users } = await testSupabase.auth.admin.listUsers();
    if (users?.users) {
      const testUsers = users.users.filter(user => 
        user.email?.includes('@test.com')
      );
      
      for (const user of testUsers) {
        await testSupabase.auth.admin.deleteUser(user.id);
      }
    }
    
    console.log('Test data cleaned');
  } catch (error) {
    console.log('Test data cleanup encountered an issue:', error);
  }
}

// Helper to create test user
export async function createTestUser(userData: typeof testUsers.user) {
  try {
    const { data, error } = await testSupabase.auth.admin.createUser({
      email: userData.email,
      password: userData.password,
      user_metadata: userData.profile
    });
    
    if (error) {
      console.log('Could not create test user:', error.message);
      return null;
    }
    
    return data.user;
  } catch (error) {
    console.log('Test user creation error:', error);
    return null;
  }
}