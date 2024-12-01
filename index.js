require('dotenv').config();
const { WebhookClient, Payload } = require('dialogflow-fulfillment');
const express = require("express");
const sheetdbNode = require('sheetdb-node');
const client = sheetdbNode({ address: 'https://sheetdb.io/api/v1/mp31kx9sbq7d2' });
const cors = require("cors");

// Define userContexts at the top level
const userContexts = new Map();

const app = express();
app.use(express.json());
app.use(cors());

app.post('/webhook', async (req, res) => {
  const agent = new WebhookClient({ request: req, response: res });
  
  // async function hi(agent) {
  //   console.log(`intent => hi`);
    
  //   try {
  //     await client.create({ 
  //       timestamp: new Date().toISOString(),
  //       customer_type: "New Interaction",
  //       query: "Welcome Intent"
  //     });
  //   } catch (error) {
  //     console.error('Error logging to sheet:', error);
  //   }
    
  //   agent.add("Welcome to the Cherry Hill Weight Loss Assistant. How may I assist you today?");
    
  //   const richContentPayload = {
  //     "richContent": [
  //       [
  //         {
  //           "type": "chips",
  //           "options": [
  //             {
  //               "text": "a. New to Cherry Hill Weight Loss?"
  //             },
  //             {
  //               "text": "b. Are You an existing customer?"
  //             }
  //           ]
  //         }
  //       ]
  //     ]
  //   };
    
  //   agent.add(new Payload(agent.UNSPECIFIED, richContentPayload, { rawPayload: true, sendAsMessage: true }));
  // }

  
// Add a helper function to check active contexts
function hasActiveContext(agent, contextName) {
  const context = agent.getContext(contextName);
  return context && context.lifespan > 0;
}

async function handleComplaint(agent) {
  console.log('Complaint handler triggered');
  
  // Set initial complaint context if not already set
  if (!hasActiveContext(agent, 'complaint-flow')) {
    agent.setContext({
      name: 'complaint-flow',
      lifespan: 5,
      parameters: { step: 'awaiting_name' }
    });
    agent.add("I understand you want to submit a complaint. Could you please tell me your name?");
    return;
  }
  
  const complaintContext = agent.getContext('complaint-flow');
  console.log('Current complaint context:', complaintContext);
  
  const step = complaintContext.parameters.step;
  const userInput = agent.query;

  switch (step) {
    case 'awaiting_name':
      agent.setContext({
        name: 'complaint-flow',
        lifespan: 5,
        parameters: {
          step: 'awaiting_email',
          name: userInput
        }
      });
      agent.add(`Thanks ${userInput}! Could you please share your email address so we can follow up with you?`);
      break;

    case 'awaiting_email':
      const email = userInput;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (!emailRegex.test(email)) {
        agent.setContext({
          name: 'complaint-flow',
          lifespan: 5,
          parameters: {
            ...complaintContext.parameters
          }
        });
        agent.add("That doesn't look like a valid email address. Could you please provide a valid email?");
        return;
      }

      agent.setContext({
        name: 'complaint-flow',
        lifespan: 5,
        parameters: {
          ...complaintContext.parameters,
          step: 'awaiting_complaint',
          email: email
        }
      });
      agent.add("Thank you. Please describe your complaint in detail:");
      break;

    case 'awaiting_complaint':
      const complaintData = complaintContext.parameters;
      const referenceId = `COMP${Date.now()}`;
      
      try {
        await client.create({
          // timestamp: new Date().toISOString(),
          name: complaintData.name,
          email: complaintData.email,
          complaint: userInput,
          status: 'New',
          reference_id: referenceId
        }, {
          sheet: 'Complaints'
        });
        
        // Clear the context after successful save
        agent.setContext({
          name: 'complaint-flow',
          lifespan: 0
        });
        
        agent.add(`Thank you ${complaintData.name} for bringing this to our attention. Your complaint has been registered with reference ID: ${referenceId}.`);
        agent.add("Our team will review your complaint and contact you at the provided email address.");
        
        const richContentPayload = {
          "richContent": [
            [
              {
                "type": "chips",
                "options": [
                  {
                    "text": "Submit Another Complaint"
                  },
                  {
                    "text": "Start Over"
                  }
                ]
              }
            ]
          ]
        };
        
        agent.add(new Payload(agent.UNSPECIFIED, richContentPayload, { 
          rawPayload: true, 
          sendAsMessage: true 
        }));

      } catch (error) {
        console.error('Error saving complaint data:', error);
        agent.add("I apologize, but I couldn't save your complaint at the moment. Please try again later.");
      }
      break;
  }
}

  

  
  async function newCustomer(agent) {
    const { name, phone } = agent.parameters;
    
    try {
      await client.create({
        // timestamp: new Date().toISOString(),
        name: name || '',
        phone: phone || '',
        email: email || '',
        customer_type: 'New Customer',
        query: 'Registration'
      });
      
      agent.add(`Thank you ${name}! We've recorded your information and our team will contact you soon.`);
    } catch (error) {
      console.error('Error saving customer data:', error);
      agent.add("I apologize, but I couldn't save your information. Please try again later.");
    }
  }

  async function fallback(agent) {
    console.log('Fallback triggered');
  
    // Capture the initial user query
    const userQuery = agent.query;
    console.log('User query:', userQuery);
  
    // If we're in a complaint flow, handle it in the complaint handler
    if (hasActiveContext(agent, 'complaint-flow')) {
      return handleComplaint(agent);
    }
  
    const session = agent.session;
    const currentContext = userContexts.get(session) || { step: 'initial' };
    console.log('Current context:', currentContext);
  
    switch (currentContext.step) {
      case 'initial':
        userContexts.set(session, { step: 'awaiting_name', originalQuery: userQuery });
        console.log('Set context to awaiting_name');
        agent.add("I’m not sure about that question, but my team will provide you with the information shortly");
        agent.add("Could you please tell me your name?")
        break;
  
      case 'awaiting_name':
        const name = agent.query;
        console.log('User name:', name);
        userContexts.set(session, {
          step: 'awaiting_email',
          name: name,
          originalQuery: currentContext.originalQuery || userQuery
        });
        console.log('Set context to awaiting_email');
        agent.add(`Thanks ${name}! Could you please share your email address?`);
        break;
  
      case 'awaiting_email':
        const email = agent.query;
        console.log('User email:', email);
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
        // Debug logging
        console.log('Current session context:', userContexts.get(session));
        console.log('Email input:', email);
  
        if (!emailRegex.test(email)) {
          agent.add("That doesn't look like a valid email address. Could you please provide a valid email?");
          return;
        }
  
        const sessionContext = userContexts.get(session);
        const userName = sessionContext?.name || 'Unknown';
        const originalQuery = sessionContext?.originalQuery || 'No original query';
        console.log('User name:', userName);
        console.log('Original Query:', originalQuery);
  
        try {
          await client.create({
<<<<<<< HEAD
            timestamp: new Date().toISOString(),
            name: userName,
=======
            // timestamp: new Date().toISOString(),
            name: userContexts.get(session).name,
>>>>>>> fada1270fbeeaccc566cb5b971bf4c9dba2725af
            email: email,
            customer_type: 'Fallback User',
            query: originalQuery  // Use the stored original query here
          });
  
          userContexts.delete(session);
  
          agent.add(`Thank you ${userName}, for your information! Our team will contact you within 30 minutes to discuss your query `);
          agent.add("How else can I help you?")
          const richContentPayload = {
            "richContent": [
              [
                {
                  "type": "chips",
                  "options": [
                    {
                      "text": "Start Over"
                    }
                  ]
                }
              ]
            ]
          };
  
          agent.add(new Payload(agent.UNSPECIFIED, richContentPayload, {
            rawPayload: true,
            sendAsMessage: true
          }));
  
        } catch (error) {
          console.error('Error saving user data:', error);
          agent.add("I apologize, but I couldn't save your information. Please try again later.");
        }
        break;
  
      default:
        userContexts.set(session, { step: 'initial' });
        agent.add("I'm sorry, but I'm having trouble understanding. Let's start over. Could you please tell me your name?");
    }
  }
  
  let intentMap = new Map();
  // intentMap.set('hi', hi);
  intentMap.set('handle_complaint', handleComplaint);  // Add the new intent
  intentMap.set('new_customer', newCustomer);
  intentMap.set('Default Fallback Intent', fallback);
  
  agent.handleRequest(intentMap);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
