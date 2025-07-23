// src/components/GetStarted.tsx
import React from 'react';
import { Plus, Users, MessageCircle, Code } from 'lucide-react';
import ConversationalGenerator from './ConversationalGenerator';
import { CompleteAgent } from '@utils/agent_database';
import type { TokenProvider } from '@utils/main_loop';

interface GetStartedProps {
  onExploreCommunity: () => void;
  onCreateNewAgent: () => void;
  onAgentGenerated: (agent: CompleteAgent, code: string) => void;
  getToken: TokenProvider;
  isAuthenticated: boolean;
  isUsingObServer: boolean;
}

const GetStarted: React.FC<GetStartedProps> = ({
  onExploreCommunity,
  onCreateNewAgent,
  onAgentGenerated,
  getToken,
  isAuthenticated,
  isUsingObServer
}) => {
  return (
    <div
        className="text-black leading-[1.5] max-w-6xl font-[ui-sans-serif,_system-ui,_sans-serif,_&quot;Apple_Color_Emoji&quot;,_&quot;Segoe_UI_Emoji&quot;,_&quot;Segoe_UI_Symbol&quot;,_&quot;Noto_Color_Emoji&quot;] flex flex-col mx-auto size-full">
        
        <div className="min-h-0 grid-cols-3 grow grid gap-6">
            <div className="min-h-0 flex flex-col col-span-2">
                <div
                    className="h-full bg-white shadow-[_#0000000d_0px_1px_2px_0px] flex flex-col border-gray-200 border-[1px] rounded-xl">
                    <div className="border-b-gray-200 border-b-[1px] shrink-0 p-6">
                        <div className="flex items-center">
                            <div
                                className="mr-3 bg-blue-50 flex justify-center items-center rounded-lg size-10">
                                <MessageCircle className="text-blue-600 size-5" strokeWidth={2} />
                            </div>
                            <div>
                                <h2
                                    className="text-gray-900 leading-[28px] text-lg font-semibold">
                                    Create Agent</h2>
                                <p className="text-gray-600 leading-[20px] text-sm">
                                    Describe what you want your agent to do</p>
                            </div>
                        </div>
                    </div>
                    <div className="min-h-0 grow p-6">
                        <ConversationalGenerator 
                            onAgentGenerated={onAgentGenerated} 
                            getToken={getToken}
                            isAuthenticated={isAuthenticated}
                            isUsingObServer={isUsingObServer}
                        />
                    </div>
                </div>
            </div>
            <div>
                <div
                    onClick={onExploreCommunity}
                    className="bg-white shadow-[_#0000000d_0px_1px_2px_0px] cursor-pointer p-6 border-gray-200 border-[1px] rounded-xl">
                    <div className="mb-4 flex items-center cursor-pointer">
                        <div
                            className="mr-3 bg-blue-50 flex justify-center items-center cursor-pointer rounded-lg size-10">
                            <Users className="text-blue-600 size-5" strokeWidth={2} />
                        </div>
                        <h3 className="text-gray-900 font-semibold cursor-pointer">
                            Community</h3>
                    </div>
                    <p
                        className="text-gray-600 leading-[20px] text-sm cursor-pointer">
                        Browse and use pre-built agents from the community</p>
                </div>
                <div
                    onClick={onCreateNewAgent}
                    className="mt-4 bg-white shadow-[_#0000000d_0px_1px_2px_0px] cursor-pointer p-6 border-gray-200 border-[1px] rounded-xl">
                    <div className="mb-4 flex items-center cursor-pointer">
                        <div
                            className="mr-3 bg-purple-50 flex justify-center items-center cursor-pointer rounded-lg size-10">
                            <Code className="text-purple-600 size-5" strokeWidth={2} />
                        </div>
                        <h3 className="text-gray-900 font-semibold cursor-pointer">
                            Build Custom</h3>
                    </div>
                    <p
                        className="text-gray-600 leading-[20px] text-sm cursor-pointer">
                        Create an agent manually with full control over its behavior
                    </p>
                </div>
            </div>
        </div>
    </div>
  );
};

export default GetStarted;
