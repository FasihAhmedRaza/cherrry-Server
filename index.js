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


// Modified fallback intent to check for active complaint flow
async function fallback(agent) {
  console.log('Fallback triggered');
  
  // If we're in a complaint flow, handle it in the complaint handler
  if (hasActiveContext(agent, 'complaint-flow')) {
    return handleComplaint(agent);
  }
  
  // Original fallback logic
  const session = agent.session;
  const currentContext = userContexts.get(session) || { step: 'initial' };
  
    switch (currentContext.step) {
      case 'initial':
        userContexts.set(session, { step: 'awaiting_name' });
        agent.add("I see you're having trouble. Let me help you better. Could you please tell me your name?");
        break;

      case 'awaiting_name':
        const name = agent.query;
        userContexts.set(session, { 
          step: 'awaiting_email',
          name: name
        });
        agent.add(`Thanks ${name}! Could you please share your email address?`);
        break;

      case 'awaiting_email':
        const email = agent.query;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (!emailRegex.test(email)) {
          agent.add("That doesn't look like a valid email address. Could you please provide a valid email?");
          return;
        }

        try {
          await client.create({
            // timestamp: new Date().toISOString(),
            name: userContexts.get(session).name,
            email: email,
            customer_type: 'Fallback User',
            query: 'Fallback Interaction'
          });
          
          userContexts.delete(session);
          
          agent.add(`Thank you for providing your information! I've saved your details and our team will get back to you soon. How else can I help you?`);
          
          const richContentPayload = {
            "richContent": [
              [
                {
                  "type": "chips",
                  "options": [
                    {
                      "text": "Start Over"
                    }
                    // },
                    // {
                    //   "text": "Contact Support"
                    // }
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

    try {
      await client.create({
        timestamp: new Date().toISOString(),
        customer_type: 'Unknown',
        query: agent.query
      });
    } catch (error) {
      console.error('Error logging fallback query:', error);
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
