import { ApiKeyModel } from '../models/api-key.model.js';
import { chooseChatModel, chooseCompletionModel } from '../utils/common.js';

export class ApiKeyMapper {
  model: ReturnType<typeof ApiKeyModel.getModel>;

  constructor() {
    this.model = ApiKeyModel.getModel();
  }

  /**
   * save or update api key
   */
  async saveApiKey(userId: string, name: string, baseUrl: string, apiKey: string, models: any[]) {
    // check if name already exists for the user
    const existing = await this.model.findOne(
      { _id: userId, "llminfo.name": name }
    );

    if (existing) {
      throw new Error('name aleady exists');
    }

    // check if usingLlm field exists, if not, set it to 0
    const llminfo = await this.getLlmInfo(userId);
    if (llminfo.length === 0) {
      // update or insert usingLlm field to 0
      await this.model.findByIdAndUpdate(
        userId,
        { $set: { usingLlm: 0 } },
        { upsert: true }
      );
    }
    const chatModel = chooseChatModel(models);
    const completionModel = chooseCompletionModel(models);

    // insert new api key info
    const newInfo = {
      name,
      baseUrl,
      apiKey,
      models,
      updatedAt: new Date(),
      usedTokens: 0,
      usingChatModel: chatModel,
      usingCompletionModel: completionModel,
    };

    await this.model.findByIdAndUpdate(
      userId,
      { $push: { llminfo: newInfo } },
      { new: true }
    );
  }

  async deleteApiKey(userIdentifier: string, name: string) {
    // get the user document
    const user = await this.model.findOne({ _id: userIdentifier });
    const usingLlm = (user as any)?.usingLlm;
    const llminfo = (user as any)?.llminfo || [];

    // check if the name exists
    const deleteIndex = llminfo.findIndex((item: any) => item.name === name);
    if (usingLlm !== undefined && usingLlm === deleteIndex) {
      // if the deleted key is the one being used, set usingLlm to -1
      await this.model.findOneAndUpdate(
        { _id: userIdentifier },
        { $set: { usingLlm: -1 } }
      );
    }

    // delete the api key info with the given name
    const result = await this.model.findOneAndUpdate(
      { _id: userIdentifier },
      { $pull: { llminfo: { name } } },
      { new: true }
    );
    return result;
  }

  async getLlmInfo(userIdentifier: string) {
    // find the llminfo array for the user
    const user = await this.model.findOne({ _id: userIdentifier }, { llminfo: 1, _id: 0 }).lean();
    return (user as any)?.llminfo || [];
  }

  async getUsingLlm(userIdentifier: string) {
    // get the usingLlm field for the user
    const user = await this.model.findOne({ _id: userIdentifier }, { usingLlm: 1, _id: 0 }).lean();
    return (user as any)?.usingLlm;
  }

  async getUsingLlmWithInfo(userIdentifier: string) {
    const doc = await this.model.findOne(
      { _id: userIdentifier },
      { usingLlm: 1, llminfo: 1, _id: 0 }
    ).lean();
    return (doc as any) || { usingLlm: -1, llminfo: [] };
  }

  async updateUsingLlm(userIdentifier: string, usingLlm: number) {
    // update the usingLlm field for the user
    await this.model.findByIdAndUpdate(
      userIdentifier,
      { $set: { usingLlm } },
      { new: true }
    );
  }

  async updateUsingModel(userIdentifier: string, name: string, chatOrCompletion: number, newModel: number) {
    // update the usingChatModel or usingCompletionModel for the given api key name
    if (chatOrCompletion === 0) { // 0 chat
      await this.model.findOneAndUpdate(
        { _id: userIdentifier, "llminfo.name": name },
        { $set: { "llminfo.$.usingChatModel": newModel } },
        { new: true }
      );
    } else if (chatOrCompletion === 1) { // 1 completion
      await this.model.findOneAndUpdate(
        { _id: userIdentifier, "llminfo.name": name },
        { $set: { "llminfo.$.usingCompletionModel": newModel } },
        { new: true }
      );
    } else {
      throw new Error('invalid chatOrCompletion value');
    }
  }
}
