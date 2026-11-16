import type { FrameworkDefinition } from "../types";
import { req } from "../helpers";

// California AB 2839 (Stats. 2024, ch. 262), Elections Code §20012.
// Held unconstitutional in Kohls v. Bonta (E.D. Cal. Aug. 29, 2025); see description.
// Guidance text is Governly's own.
export const caAb2839: FrameworkDefinition = {
  slug: "ca-ab-2839",
  name: "California AB 2839 — Election Deepfakes",
  navLabel: "California AB 2839",
  kind: "regulation",
  policyNames: ["California AB 2839 — Election Deepfakes"],
  description:
    "NOT CURRENTLY ENFORCEABLE. AB 2839 (Elections Code §20012, urgency statute effective September 17, 2024) bars knowingly distributing, with malice, election ads and communications containing materially deceptive AI-generated or altered content about candidates, election officials or election equipment in the 120 days before (and for some content 60 days after) a California election, with labelling rules for self-portrayals and satire. A federal court preliminarily enjoined it in October 2024 and, on August 29, 2025, granted summary judgment holding it violates the First Amendment (Kohls v. Bonta, No. 2:24-cv-02527, E.D. Cal.); enforcement is enjoined except, as reported, the audio-only disclosure provision. The State's appeal is pending in the Ninth Circuit (No. 25-6138). The controls below track the statute's text in case it is revived on appeal.",
  source: {
    title: "California Legislative Information — AB-2839 Elections: deceptive media in advertisements (Chapter 262, Statutes of 2024)",
    url: "https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240AB2839",
  },
  sections: [
    {
      key: "1",
      title: "Scope",
      requirements: [
        req(
          "1.1",
          "Election Content Identification",
          "Know which content is a covered election ad or communication",
          "Identify ads and election communications about California candidates, ballot measures, voting or the vote count, and flag any that contain digitally created or modified media, including deepfakes, that would look authentic to a reasonable person (§20012(f)(1), (f)(5), (f)(8)).",
          [
            "Do we produce, pay for or distribute content about California candidates, ballot measures or voting?",
            "Is AI-generated or digitally altered audio, image or video in that content flagged before release?",
            "Are minor edits (brightness, contrast, noise removal) distinguished from material changes?",
          ],
          [
            "Election content register",
            "Synthetic media flags in review workflow",
            "Editing guidelines",
          ],
        ),
      ],
    },
    {
      key: "2",
      title: "Prohibited Deceptive Content",
      requirements: [
        req(
          "2.1",
          "No Malicious Deceptive Election Content",
          "Do not knowingly distribute false depictions during election windows",
          "Do not, with knowledge of falsity or reckless disregard for the truth, distribute election content falsely depicting a candidate, elections official, elected official, or voting machine, ballot or site in a way likely to harm a candidate or falsely undermine confidence in results, within 120 days before an election (and up to 60 days after for officials and election equipment) (§20012(b)(1), (c), (f)(7)).",
          [
            "Is election content checked against the 120-day pre-election and 60-day post-election windows?",
            "Is there a review step confirming depictions of real people and election equipment are authentic?",
            "Who approves release of any altered depiction of a candidate or official?",
          ],
          [
            "Election calendar with blackout windows",
            "Content authenticity review records",
            "Release approvals",
          ],
        ),
      ],
    },
    {
      key: "3",
      title: "Disclosure and Labelling",
      requirements: [
        req(
          "3.1",
          "Candidate Self-Portrayal Label",
          "Label manipulated media of a candidate made by that candidate",
          "When a candidate's own content shows them doing or saying something they did not, include \"This [image/audio/video] has been manipulated.\" — readable at least as large as other text and shown for a video's full length, or for audio read clearly at the start, end and at least every two minutes — in the content's language (§20012(b)(2), (g)).",
          [
            "Is the correct media term (image, audio, video) used in the label?",
            "Do size, duration and audio placement meet the statutory format?",
            "Is the label translated when the content is not in English?",
          ],
          [
            "Label templates",
            "Pre-release format checks",
            "Translated label copies",
          ],
        ),
        req(
          "3.2",
          "Satire and Parody Label",
          "Label manipulated satire or parody",
          "Mark satire or parody containing materially deceptive content with \"This [image/audio/video] has been manipulated for purposes of satire or parody.\" using the same format rules as the self-portrayal label (§20012(b)(3)).",
          [
            "Is satirical election content identified before release?",
            "Does its label use the exact wording and format?",
            "Is labelling verified for each channel the content runs on?",
          ],
          [
            "Satire content log",
            "Labelled content samples",
            "Channel check records",
          ],
        ),
        req(
          "3.3",
          "Keep Disclosures Intact",
          "Never strip or omit required labels when sharing",
          "Do not remove a required disclosure, or knowingly republish labelled content without it, during the covered period; doing so is treated as evidence of intent (§20012(b)(4)).",
          [
            "Do reposting and editing workflows preserve existing manipulation labels?",
            "Are staff told not to crop or trim out disclosures?",
            "Is third-party content checked for labels before republishing?",
          ],
          [
            "Republishing procedure",
            "Staff guidance",
            "Repost review records",
          ],
        ),
      ],
    },
    {
      key: "4",
      title: "Media Exemptions",
      requirements: [
        req(
          "4.1",
          "Broadcaster and Publisher Exemption Conditions",
          "Meet the conditions if relying on a news or paid-ad exemption",
          "Broadcasters and periodicals relying on an exemption must clearly state that news coverage of deceptive content does not depict real events, and broadcasters airing paid ads must either give buyers equivalent prohibition and disclaimer requirements or be bound by federal must-carry or no-censorship rules (§20012(e)).",
          [
            "Does news coverage of deceptive content carry a clear statement that it is not authentic?",
            "Are prohibition and disclaimer terms given to every political ad buyer?",
            "Is it documented when federal law requires airing an ad unaltered?",
          ],
          [
            "On-air and print disclaimer samples",
            "Political ad terms provided to buyers",
            "Federal-law determination records",
          ],
        ),
      ],
    },
  ],
};
