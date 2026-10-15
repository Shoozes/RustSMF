import { samplerFixtures, decodedSamplerFixture } from './retarget-sampler-fixtures';
const fixtures = samplerFixtures();
fixtures.positives.push(await decodedSamplerFixture());
console.log(JSON.stringify(fixtures));
