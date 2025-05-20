const cheerio = require('cheerio');
const httpClient = require('./httpClient');
const config = require('./config');
const fs = require('fs');
const path = require('path');
const db = require('../db/db');
const track = require('./track');
const logger = require('./logger');
const axios = require('axios');
const urlUtils = require('./urlUtils');

// Initialize allProcessedMovies by loading from movies.json if it exists
let allProcessedMovies = [];
async function loadProcessedMovies() {
  try {
    const { moviesChunkDir } = config.paths;
    
    // Only use chunked files, skip the combined file entirely
    if (config.movieChunking && config.movieChunking.enabled) {
      // Check if chunk index exists
      const indexPath = path.join(moviesChunkDir, 'index.json');
      
      if (!fs.existsSync(indexPath)) {
        console.log('Movie chunks index not found, returning empty array');
        return [];
      }
      
      // Read the index to get all chunks
      const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      let allMovies = [];
      
      // Load and combine all chunks
      for (const chunk of indexData.chunks) {
        const chunkPath = path.join(moviesChunkDir, chunk.fileName);
        if (fs.existsSync(chunkPath)) {
          const chunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
          allMovies = allMovies.concat(chunkData);
        } else {
          console.log(`Warning: Chunk file ${chunk.fileName} not found`);
        }
      }
      
      console.log(`Loaded ${allMovies.length} movies from ${indexData.chunks.length} chunks`);
      return allMovies;
    } else {
      console.log('Movie chunking is disabled but we only support chunked mode now');
      return [];
    }
  } catch (error) {
    console.error('Error loading processed movies:', error);
    return [];
  }
}

// Load movies when the module is first required
loadProcessedMovies();

// Helper function to handle empty strings
function handleEmptyValue(value) {
  return value && value !== '' ? value : null;
}

// Save HTML content to a file for debugging
function saveHtmlContent(html, url, name = null) {
  // HTML saving disabled
  return null;

  /* Original implementation commented out
  try {
    // Make sure config paths exist
    if (!config.paths || !config.paths.output) {
      console.error('Output directory not defined in config');
      return null;
    }
    
    const htmlFolder = ensureHtmlFolderExists();
    if (!htmlFolder) {
      console.error('Failed to create HTML folder');
      return null;
    }
    
    // Generate a filename based on URL or name
    let fileName;
    if (name) {
      // Use provided name but make it file-system safe
      fileName = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
    } else if (url) {
      // Generate from URL: extract domain and path parts
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/\./g, '_');
        const pathPart = urlObj.pathname.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        fileName = `${domain}${pathPart}_${Date.now()}.html`;
      } catch (err) {
        // If URL parsing fails, use a generic name with timestamp
        fileName = `nexdrive_page_${Date.now()}.html`;
      }
    } else {
      // Fallback if no name or URL
      fileName = `nexdrive_page_${Date.now()}.html`;
    }
    
    const filePath = path.join(htmlFolder, fileName);
    fs.writeFileSync(filePath, html);
    console.log(`Saved HTML content to ${filePath}`);
    return filePath;
  } catch (error) {
    console.error(`Error saving HTML content: ${error.message}`);
    return null;
  }
  */
}

// Ensure the HTML folder exists for storing HTML content
function ensureHtmlFolderExists() {
  // HTML folder creation disabled
  return null;

  /* Original implementation commented out
  try {
    // Make sure config paths exist
    if (!config.paths || !config.paths.output) {
      console.error('Output directory not defined in config');
      // Create default path
      const defaultPath = path.join(process.cwd(), 'output', 'html');
      if (!fs.existsSync(defaultPath)) {
        fs.mkdirSync(defaultPath, { recursive: true });
        console.log(`Created default HTML folder at ${defaultPath}`);
      }
      return defaultPath;
    }
    
    const htmlFolderPath = path.join(config.paths.output, 'html');
    if (!fs.existsSync(htmlFolderPath)) {
      fs.mkdirSync(htmlFolderPath, { recursive: true });
      console.log(`Creating HTML folder at ${htmlFolderPath}`);
    }
    return htmlFolderPath;
  } catch (error) {
    console.error(`Error creating HTML folder: ${error.message}`);
    return null;
  }
  */
}

// Process nexdrive link groups specially for better organization
async function processNexdriveLinks(mainContent, $) {
  console.log('\n=== Processing Nexdrive Link Groups ===');
  let totalLinksFound = 0;
  
  // First, try to detect if this is an episode-based page or quality-based page
  const isEpisodeBased = detectEpisodeBasedContent(mainContent, $);
  
  if (isEpisodeBased) {
    console.log('Detected episode-based content structure');
    const sections = processEpisodeBasedLinks(mainContent, $);
    
    // Now we need to visit each nexdrive link and fetch the actual download links
    if (sections && sections.length > 0) {
      for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
        const section = sections[sectionIndex];
        if (section.links && section.links.length > 0) {
          // Store processed links for this section
          const processedSectionLinks = [];
          
          for (let groupIndex = 0; groupIndex < section.links.length; groupIndex++) {
            const group = section.links[groupIndex];
            
            console.log(`Processing button type: ${group.type} (${group.buttonLabel})`);
            
            // Check if this is our episode-based link object with links mapping episodes to URLs
            if (group.links && typeof group.links === 'object' && !Array.isArray(group.links)) {
              console.log('Processing episode-based links structure');
              
              // Process Batch/Zip links instead of skipping them
              if (group.type === 'Batch/Zip') {
                console.log('Processing Batch/Zip links to extract actual download links');
                
                // Collect size information from the button label
                let zipSize = '';
                const sizeMatch = group.buttonLabel.match(/\[([0-9.]+[MG]B)\]/i);
                if (sizeMatch) {
                  zipSize = sizeMatch[1];
                }
                
                // Collect quality from heading if available
                let zipQuality = '';
                if (section.heading) {
                  const qualityMatch = section.heading.match(/(480p|720p|1080p)/i);
                  if (qualityMatch) {
                    zipQuality = qualityMatch[1];
                  }
                }
                
                // Create a map to collect all links by button type and episode number
                const batchLinksByEpisode = {};
                
                // Process Batch/Zip nexdrive links
                for (const [episodeNum, nexdriveUrl] of Object.entries(group.links)) {
                  totalLinksFound++;
                  
                  if (nexdriveUrl.includes('nexdrive.lol')) {
                    console.log(`\nFollowing Batch/Zip Nexdrive link: ${nexdriveUrl}`);
                    
                    try {
                      // Fetch actual download links from this nexdrive page
                      const downloadLinks = await fetchNextdriveLinks(nexdriveUrl, `Batch Zip ${zipSize}`);
                      
                      if (downloadLinks && downloadLinks.length > 0) {
                        console.log(`Found ${downloadLinks.length} direct links from Batch/Zip nexdrive page`);
                        
                        // Create a structured response with the special format requested
                        const batchZipLinks = {
                          // Use the full button label for name field, rather than just "Batch/Zip"
                          name: group.buttonLabel || "Batch/Zip",
                          quality: zipQuality,
                          type: "Batch/Zip",
                          size: zipSize,
                          links: []
                        };
                        
                        // Process each link type returned
                        downloadLinks.forEach(buttonTypeData => {
                          // Handle both single link and episode-based links
                          if (buttonTypeData.link) {
                            // Single link format
                            batchZipLinks.links.push({
                              buttonLabel: buttonTypeData.buttonLabel,
                              link: buttonTypeData.link,
                              type: buttonTypeData.type
                            });
                          } else if (buttonTypeData.links && Object.keys(buttonTypeData.links).length > 0) {
                            // Episode-based link format - extract each link
                            for (const [linkEpisode, linkUrl] of Object.entries(buttonTypeData.links)) {
                              batchZipLinks.links.push({
                                buttonLabel: `${buttonTypeData.buttonLabel} [Episode ${linkEpisode}]`,
                                link: linkUrl,
                                type: buttonTypeData.type
                              });
                            }
                          }
                        });
                        
                        // Store the complete processed batch zip entry
                        if (batchZipLinks.links.length > 0) {
                          batchLinksByEpisode[episodeNum] = batchZipLinks;
                        } else {
                          // If no links found, keep the original nexdrive URL
                          batchLinksByEpisode[episodeNum] = {
                            // Use the full button label for name field
                            name: group.buttonLabel || "Batch/Zip",
                            quality: zipQuality,
                            type: "Batch/Zip",
                            size: zipSize,
                            links: [{
                              buttonLabel: group.buttonLabel,
                              link: nexdriveUrl,
                              type: "Batch/Zip"
                            }]
                          };
                        }
                      } else {
                        // If no download links found, keep original nexdrive URL
                        batchLinksByEpisode[episodeNum] = {
                          // Use the full button label for name field
                          name: group.buttonLabel || "Batch/Zip",
                          quality: zipQuality,
                          type: "Batch/Zip",
                          size: zipSize,
                          links: [{
                            buttonLabel: group.buttonLabel,
                            link: nexdriveUrl,
                            type: "Batch/Zip"
                          }]
                        };
                      }
                    } catch (error) {
                      console.error(`Error processing Batch/Zip nexdrive link: ${error.message}`);
                      // Keep original nexdrive URL on error
                      batchLinksByEpisode[episodeNum] = {
                        // Use the full button label for name field
                        name: group.buttonLabel || "Batch/Zip",
                        quality: zipQuality,
                        type: "Batch/Zip",
                        size: zipSize,
                        links: [{
                          buttonLabel: group.buttonLabel,
                          link: nexdriveUrl,
                          type: "Batch/Zip"
                        }]
                      };
                    }
                  } else {
                    // For non-nexdrive batch/zip links, store directly
                    batchLinksByEpisode[episodeNum] = {
                      // Use the full button label for name field
                      name: group.buttonLabel || "Batch/Zip",
                      quality: zipQuality,
                      type: "Batch/Zip",
                      size: zipSize,
                      links: [{
                        buttonLabel: group.buttonLabel,
                        link: nexdriveUrl,
                        type: "Batch/Zip"
                      }]
                    };
                  }
                }
                
                // Add all processed batch links to section
                for (const [episodeNum, batchLinks] of Object.entries(batchLinksByEpisode)) {
                  processedSectionLinks.push(batchLinks);
                }
                
                continue;
              }
              
              // Follow Nexdrive links and replace with direct download links
              if (Object.values(group.links).some(url => 
                  url.includes('nexdrive.lol') || 
                  url.includes('gdtot') || 
                  url.includes('gdflix') || 
                  url.includes('driveleech'))) {
                
                // Create a map to collect all links by button type and episode number
                const episodeLinksByType = {};
                
                // Process each episode nexdrive link
                for (const [episodeNum, nexdriveUrl] of Object.entries(group.links)) {
                  totalLinksFound++;
                  
                  // Skip non-Nexdrive links
                  if (!nexdriveUrl || 
                     (!nexdriveUrl.includes('nexdrive.lol') && 
                      !nexdriveUrl.includes('gdtot') && 
                      !nexdriveUrl.includes('gdflix') && 
                      !nexdriveUrl.includes('driveleech'))) {
                    
                    // For non-nexdrive links, store directly in the appropriate button type
                    if (!episodeLinksByType[group.type]) {
                      episodeLinksByType[group.type] = {
                        buttonLabel: group.buttonLabel || `${group.type} Button`,
                        type: group.type,
                        links: {}
                      };
                    }
                    episodeLinksByType[group.type].links[episodeNum] = nexdriveUrl;
                    console.log(`Added non-nexdrive link for episode ${episodeNum}: ${nexdriveUrl}`);
                    continue;
                  }
                  
                  // Process Nexdrive link
                  console.log(`\nFollowing Nexdrive link for episode ${episodeNum}: ${nexdriveUrl}`);
                  
                  try {
                    // Fetch actual download links from this nexdrive page
                    const downloadLinks = await fetchNextdriveLinks(nexdriveUrl, `Episode ${episodeNum}`);
                    
                    if (downloadLinks && downloadLinks.length > 0) {
                      console.log(`Found ${downloadLinks.length} direct link types for episode ${episodeNum}`);
                      
                      // Process each button type returned from the nexdrive page
                      downloadLinks.forEach(buttonTypeData => {
                        const buttonType = buttonTypeData.type;
                        const buttonLabel = buttonTypeData.buttonLabel;
                        
                        // Initialize this button type in our collection if not exists
                        if (!episodeLinksByType[buttonType]) {
                          episodeLinksByType[buttonType] = {
                            buttonLabel: buttonLabel,
                            type: buttonType,
                            links: {}
                          };
                        }
                        
                        // Add links for this episode number
                        if (buttonTypeData.links && Object.keys(buttonTypeData.links).length > 0) {
                          // We expect links to use episode numbers as keys, but sometimes they're not
                          // Use the current episodeNum if there's only a single link or if the keys don't match episode numbers
                          if (Object.keys(buttonTypeData.links).length === 1) {
                            const firstLink = Object.values(buttonTypeData.links)[0];
                            episodeLinksByType[buttonType].links[episodeNum] = firstLink;
                            console.log(`Added ${buttonType} direct link for episode ${episodeNum}: ${firstLink}`);
                          } else {
                            // Multiple links found, use their original episode numbers if they look valid
                            for (const [linkEpisode, directUrl] of Object.entries(buttonTypeData.links)) {
                              const finalEpisode = (linkEpisode === '1' && episodeNum !== '1') ? episodeNum : linkEpisode;
                              episodeLinksByType[buttonType].links[finalEpisode] = directUrl;
                              console.log(`Added ${buttonType} direct link for episode ${finalEpisode}: ${directUrl}`);
                            }
                          }
                        }
                      });
                    } else {
                      // No download links found, keep nexdrive URL in original button type
                      if (!episodeLinksByType[group.type]) {
                        episodeLinksByType[group.type] = {
                          buttonLabel: group.buttonLabel || `${group.type} Button`,
                          type: group.type,
                          links: {}
                        };
                      }
                      episodeLinksByType[group.type].links[episodeNum] = nexdriveUrl;
                      console.log(`No direct links found, keeping original nexdrive link for episode ${episodeNum}`);
                    }
                  } catch (error) {
                    console.error(`Error processing nexdrive link: ${error.message}`);
                    // Keep nexdrive URL on error in original button type
                    if (!episodeLinksByType[group.type]) {
                      episodeLinksByType[group.type] = {
                        buttonLabel: group.buttonLabel || `${group.type} Button`,
                        type: group.type,
                        links: {}
                      };
                    }
                    episodeLinksByType[group.type].links[episodeNum] = nexdriveUrl;
                  }
                }
                
                // Convert the map of button types to an array and add to processed section links
                processedSectionLinks.push(...Object.values(episodeLinksByType));
              } else {
                // No nexdrive links to process, add group as-is
                processedSectionLinks.push(group);
              }
            }
            // Handle the old array-based link structure
            else if (group.links && Array.isArray(group.links)) {
              console.log('Processing array-based link structure');
              
              // Process each link in the array
              const processedLinks = group.links.map(link => {
                if (link.link && (
                  link.link.includes('nexdrive.lol') || 
                  link.link.includes('gdtot') ||
                  link.link.includes('gdflix') ||
                  link.link.includes('driveleech'))) {
                  
                  // This is a nexdrive link, but we'll process it as-is for now
                  // We can enhance this later if needed
                  totalLinksFound++;
                }
                return link; // Keep link as-is for now
              });
              
              // Add processed group to section
              if (processedLinks.length > 0) {
                processedSectionLinks.push({
                  ...group,
                  links: processedLinks
                });
              }
            }
          }
          
          // Replace original links with processed links
          section.links = processedSectionLinks;
        }
      }
    }
    
    logger.updateLinkProgress(totalLinksFound, totalLinksFound);
    return sections;
  } else {
    console.log('Detected quality-based content structure');
    const sections = await processQualityBasedLinks(mainContent, $);
    
    // Handle quality-based links similar to episode-based
    // This can be simplified if the structure is already correct
    
    logger.updateLinkProgress(totalLinksFound, totalLinksFound);
    return sections;
  }
}

// Determine if the HTML content is episode-based or quality-based
function detectEpisodeBasedContent(mainContent, $) {
  // Look for episode-style headings like "Episodes: 01" or "Season 2 [S02E04]"
  let episodeHeadingCount = 0;
  let seasonHeadingCount = 0;
  
  // Look for season-specific headings first
  mainContent.find('h2, h3, h4, h5').each(function() {
    const headingText = $(this).text().trim();
    
    // Check for Season headings
    if (headingText.match(/Season\s+\d+/i) && 
        (headingText.match(/\{.+\}/i) || headingText.match(/\[\d+MB\/E\]/i))) {
      seasonHeadingCount++;
      console.log(`Found season heading: "${headingText}"`);
    }
    
    // Check for Episode headings
    if (headingText.match(/episodes?\s*:\s*\d+/i) || 
        headingText.match(/-\s*:\s*episodes?\s*:\s*\d+\s*:-/i) ||
        headingText.match(/s\d+e\d+/i) ||
        headingText.match(/-\s*episode[s\s]*\d+\s*-/i) ||
        headingText.match(/^episode\s*\d+$/i) ||
        headingText.match(/episode\s*\d+\s*added/i)) {
      episodeHeadingCount++;
      console.log(`Found episode heading: "${headingText}"`);
    }
  });
  
  console.log(`Total season headings found: ${seasonHeadingCount}`);
  console.log(`Total episode headings found: ${episodeHeadingCount}`);
  
  // If we find multiple season headings or episode headings, it's likely episode-based
  return seasonHeadingCount >= 2 || episodeHeadingCount >= 2;
}

// Process episode-based link structure (like TV shows with separate episode links)
function processEpisodeBasedLinks(mainContent, $) {
  console.log('Processing episode-based link structure');
  
  // Structure to store the final sections
  const sections = [];
  
  // Helper function to handle empty strings in quality and size
  function handleEmptyValue(value) {
    return value && value !== '' ? value : null;
  }
  
  // Helper function to determine button type from button text
  function getButtonType(buttonText) {
    if (!buttonText) return 'Download';
    
    if (buttonText.includes('G-Direct')) return 'G-Direct';
    if (buttonText.includes('V-Cloud')) return 'V-Cloud';
    if (buttonText.includes('GDToT')) return 'GDToT';
    if (buttonText.includes('Filepress')) return 'Filepress';
    if (buttonText.includes('DropGalaxy')) return 'DropGalaxy';
    if (buttonText.includes('Batch/Zip')) return 'Batch/Zip';
    return 'Download';
  }
  
  // Find all headings within the main content that look like section headings
  mainContent.find('h3').each(function() {
    const headingElement = $(this);
    const headingText = headingElement.text().trim();
    
    // Skip empty headings
    if (!headingText) return;
    
    console.log(`Processing heading: ${headingText}`);
    
    // Check if this heading appears to be for a season or quality option
    if (headingText.includes('Season') || 
        headingText.includes('480p') || 
        headingText.includes('720p') || 
        headingText.includes('1080p')) {
      
      // Create a new section with this heading
      const section = {
        heading: headingText,
        links: []
      };
      
      // Extract quality from the heading (e.g., 720p, 1080p)
      let quality = '';
      const qualityMatch = headingText.match(/(480p|720p|1080p)/i);
      if (qualityMatch) {
        quality = qualityMatch[1];
      }
      
      // Extract size from the heading
      let size = '';
      const sizeMatch = headingText.match(/\[([0-9.]+[MG]B)\/E\]/i) || 
                        headingText.match(/\[([0-9.]+[MG]B)\]/i);
      if (sizeMatch) {
        size = sizeMatch[1];
      }
      
      // Find links in the next element
      let nextElement = headingElement.next();
      
      // Create a temporary store for all links by button type and episode
      const linksByButtonType = {};
      
      // Process elements until we hit another h3 or h4
      while (nextElement.length && !nextElement.is('h3') && !nextElement.is('h4')) {
        // Check if this is a paragraph with links
        if (nextElement.is('p')) {
          nextElement.find('a').each(function() {
          const link = $(this);
          const href = link.attr('href');
            
            if (href && !href.includes('#')) {
              // Check for button inside the anchor
          const button = link.find('button');
              let buttonText = '';
              
              if (button.length > 0) {
                buttonText = button.text().trim();
              } else {
                // If no button element, use the anchor text itself
                buttonText = link.text().trim();
              }
              
              // Determine the button type
              const buttonType = getButtonType(buttonText);
              
              // Look for episode information in the surrounding content
              let episodeNum = '1'; // Default episode number
              
              // Look for episode number in parent or previous text
              const parentText = link.parent().text().trim();
              const episodeMatch = parentText.match(/Episode[s]*\s*(\d+)/i) ||
                                  parentText.match(/E(\d+)/i) ||
                                  parentText.match(/-\s*Episode[s]*\s*(\d+)\s*-/i) ||
                                  parentText.match(/-\s*:\s*Episodes?\s*:?\s*(\d+)\s*:-/i);
              
              if (episodeMatch) {
                episodeNum = episodeMatch[1];
              }
              
              // Initialize the button type in our map if it doesn't exist
              if (!linksByButtonType[buttonType]) {
                linksByButtonType[buttonType] = {
                  buttonLabel: buttonText || `${buttonType}`,
                  type: buttonType,
                  links: {}
                };
              }
              
              // Add this link to its button type and episode
              linksByButtonType[buttonType].links[episodeNum] = href;
              
              console.log(`Added ${buttonType} link for episode ${episodeNum}: ${href}`);
            }
          });
        }
        
        // Move to the next element
        nextElement = nextElement.next();
      }
      
      // If we found episode links, add them to the section
      if (Object.keys(linksByButtonType).length > 0) {
        // Convert our map to an array for the final output
        section.links = Object.values(linksByButtonType);
    sections.push(section);
        console.log(`Added section "${headingText}" with ${section.links.length} button types`);
      }
    }
  });
    
  // If no sections were found, try the quality-based approach as fallback
  if (sections.length === 0) {
    console.log('No episode-based sections found, falling back to quality-based structure');
    return processQualityBasedLinks(mainContent, $);
  }
  
  return sections;
}

// Process quality-based link structure (like movies with different quality options)
async function processQualityBasedLinks(mainContent, $) {
  console.log('Processing quality-based link structure');
  const qualityGroups = {};
  let linksFound = 0;
  
  // Helper function to handle empty strings in quality and size
  function handleEmptyValue(value) {
    return value && value !== '' ? value : null;
  }
  
  // Helper function to determine button type from button text
  function getButtonType(buttonText) {
    if (!buttonText) return 'Download';
    
    if (buttonText.includes('G-Direct')) return 'G-Direct';
    if (buttonText.includes('V-Cloud')) return 'V-Cloud';
    if (buttonText.includes('GDToT')) return 'GDToT';
    if (buttonText.includes('Filepress')) return 'Filepress';
    if (buttonText.includes('DropGalaxy')) return 'DropGalaxy';
    if (buttonText.includes('Batch/Zip')) return 'Batch/Zip';
    return 'Download';
  }
  
  // We don't extract notes here anymore - notes only come from nexdrive pages
  
  // First collect all h5 headings with their corresponding download links
  $('h5').each(function() {
    const heading = $(this);
    const headingText = heading.text().trim();
    
    // Check if this is a quality-specific heading 
    if (headingText.includes('480p') || 
        headingText.includes('720p') || 
        headingText.includes('1080p') ||
        headingText.includes('BluRay') ||
        headingText.includes('WEB-DL')) {
      
      console.log(`Found quality heading (h5): ${headingText}`);
      
      // Extract quality information from heading
      let headingQuality = '';
      if (headingText.includes('480p')) headingQuality = '480p';
      else if (headingText.includes('720p')) headingQuality = '720p';
      else if (headingText.includes('1080p')) headingQuality = '1080p';
      
      // Extract size if available in heading
      let headingSize = '';
      const sizeMatch = headingText.match(/\[([0-9.]+[MG]B)\/E\]/i) || 
                        headingText.match(/\[([0-9.]+[MG]B)\]/i);
      if (sizeMatch) {
        headingSize = sizeMatch[1];
      }
      
      // Look for links in the next paragraph
      const nextP = heading.next('p');
      if (nextP.length > 0) {
        const links = [];
        
        nextP.find('a').each(function() {
          const link = $(this);
          const href = link.attr('href');
          
          if (href && 
              !href.includes('#respond') && 
              !href.includes('replytocom') &&
              !href.includes('#comment')) {
            
            // Try to get button text from button element inside the anchor
            const button = link.find('button');
            let buttonText = '';
            
            if (button.length > 0) {
              buttonText = button.text().trim();
        } else {
              // If no button element, use the anchor text itself
              buttonText = link.text().trim();
            }
            
            console.log(`Found link: ${buttonText} - ${href}`);
            linksFound++;
            
            // Create simplified link without quality and size (moved to parent)
            links.push({
              buttonLabel: buttonText || 'Download Now',
              link: href,
              type: getButtonType(buttonText)
            });
          }
        });
        
        if (links.length > 0) {
          // Store links with quality and size at group level
          qualityGroups[headingText] = {
            links: links,
            quality: handleEmptyValue(headingQuality),
            size: handleEmptyValue(headingSize)
          };
          console.log(`Added ${links.length} links to group "${headingText}" with quality: ${headingQuality}, size: ${headingSize}`);
        }
      }
    }
  });
  
  // If no h5 headings were found, look for h3 headings as fallback
  if (Object.keys(qualityGroups).length === 0) {
    $('h3').each(function() {
        const heading = $(this);
        const headingText = heading.text().trim();
        
      // Match quality patterns
      if (headingText.match(/Season \d+.*\{.+\}/i) || 
            headingText.match(/Season \d+.*\d+p/i) || 
          headingText.match(/\d+p.*Quality/i) ||
          headingText.match(/\{.+\}.*\d+p/i)) {
        
        console.log(`Found quality heading (h3): ${headingText}`);
        
        // Extract quality information from heading
        let headingQuality = '';
        if (headingText.includes('480p')) headingQuality = '480p';
        else if (headingText.includes('720p')) headingQuality = '720p';
        else if (headingText.includes('1080p')) headingQuality = '1080p';
        
        // Extract size if available in heading
        let headingSize = '';
        const sizeMatch = headingText.match(/\[([0-9.]+[MG]B)\/E\]/i) || 
                          headingText.match(/\[([0-9.]+[MG]B)\]/i);
        if (sizeMatch) {
          headingSize = sizeMatch[1];
        }
        
        // Look for links in the next paragraph
          const nextP = heading.next('p');
        if (nextP.length > 0) {
          const links = [];
            
            nextP.find('a').each(function() {
              const link = $(this);
              const href = link.attr('href');
              
              if (href && 
                  !href.includes('#respond') && 
                  !href.includes('replytocom') &&
                  !href.includes('#comment')) {
                
              // Try to get button text from button element inside the anchor
              const button = link.find('button');
              let buttonText = '';
              
              if (button.length > 0) {
                buttonText = button.text().trim();
              } else {
                // If no button element, use the anchor text itself
                buttonText = link.text().trim();
              }
              
              console.log(`Found link: ${buttonText} - ${href}`);
              linksFound++;
              
              // Create simplified link without quality and size
              links.push({
                  buttonLabel: buttonText || 'Download Now',
                  link: href,
                type: getButtonType(buttonText)
              });
            }
          });
          
          if (links.length > 0) {
            // Store links with quality and size at group level
            qualityGroups[headingText] = {
              links: links,
              quality: handleEmptyValue(headingQuality),
              size: handleEmptyValue(headingSize)
            };
            console.log(`Added ${links.length} links to group "${headingText}" with quality: ${headingQuality}, size: ${headingSize}`);
            }
          }
        }
      });
  }
  
  // Convert to the section structure expected by our database
  const sections = [];
  if (Object.keys(qualityGroups).length > 0) {
    // Create sections for each heading instead of grouping them
    for (const [heading, groupData] of Object.entries(qualityGroups)) {
      // Get the button text for the name instead of using the heading
      let linkName = "Download Now"; // Default value
      
      // Try to get the actual button text
      if (groupData.links.length > 0) {
        linkName = groupData.links[0].buttonLabel || "Download Now";
      }
      
      const section = {
        heading: heading, // Use the original heading
        links: [{
          name: linkName, // Use the button text for the name
          quality: handleEmptyValue(groupData.quality),
          size: handleEmptyValue(groupData.size),
          links: groupData.links
          // Don't add notes here - notes will only come from nexdrive pages
        }]
      };
      sections.push(section);
      console.log(`Created section with heading: "${heading}" and name: "${linkName}", quality: ${groupData.quality}, size: ${groupData.size}`);
        }
      } else {
    console.log('No quality groups found, checking for direct download links');
    
    // If no quality groups were found, check for direct download links
    const directLinks = [];
    const headingMap = {}; // To map links to their parent headings
    
    // First, look for h5 headings with nexdrive links in the next paragraph
    $('h5').each(function() {
      const headingElement = $(this);
      const headingText = headingElement.text().trim();
      const nextP = headingElement.next('p');
      
      // Extract quality information from heading
      let headingQuality = '';
      if (headingText.includes('480p')) headingQuality = '480p';
      else if (headingText.includes('720p')) headingQuality = '720p';
      else if (headingText.includes('1080p')) headingQuality = '1080p';
      
      // Extract size if available in heading
      let headingSize = '';
      const sizeMatch = headingText.match(/\[([0-9.]+[MG]B)\/E\]/i) || 
                        headingText.match(/\[([0-9.]+[MG]B)\]/i);
      if (sizeMatch) {
        headingSize = sizeMatch[1];
      }
      
        if (nextP.length > 0) {
        nextP.find('a[href*="nexdrive"]').each(function() {
              const link = $(this);
              const href = link.attr('href');
              const button = link.find('button');
          let buttonText = '';
          
          if (button.length > 0) {
            buttonText = button.text().trim();
          } else {
            buttonText = link.text().trim();
          }
              
              if (href && 
                  !href.includes('#respond') && 
                  !href.includes('replytocom') &&
                  !href.includes('#comment')) {
            console.log(`Found nexdrive link: ${buttonText} - ${href} with heading: ${headingText}`);
            linksFound++;
            
            // Use the heading text as a key
            if (!headingMap[headingText]) {
              headingMap[headingText] = {
                buttons: [],
                links: [],
                quality: handleEmptyValue(headingQuality),
                size: handleEmptyValue(headingSize)
              };
            }
            
            // Store button text separately
            headingMap[headingText].buttons.push(buttonText || 'Download Now');
            
            headingMap[headingText].links.push({
              buttonLabel: buttonText || 'Download Now',
              link: href,
              type: getButtonType(buttonText)
            });
          }
        });
      }
    });
    
    // If no h5 headings with nexdrive links, fall back to a general search
    if (Object.keys(headingMap).length === 0) {
      $('a[href*="nexdrive"]').each(function() {
              const link = $(this);
              const href = link.attr('href');
              const button = link.find('button');
        let buttonText = '';
        
        if (button.length > 0) {
          buttonText = button.text().trim();
        } else {
          buttonText = link.text().trim();
        }
              
              if (href && 
                  !href.includes('#respond') && 
                  !href.includes('replytocom') &&
                  !href.includes('#comment')) {
          console.log(`Found direct nexdrive link: ${buttonText} - ${href}`);
          linksFound++;
                
          directLinks.push({
                  buttonLabel: buttonText || 'Download Now',
                  link: href,
            type: getButtonType(buttonText)
          });
        }
      });
    }
    
    // Create sections based on the headingMap first (preferred)
    if (Object.keys(headingMap).length > 0) {
      for (const [heading, data] of Object.entries(headingMap)) {
        // Get the most common button text to use as name
        let linkName = "Download Now";
        if (data.buttons && data.buttons.length > 0) {
          linkName = data.buttons[0]; // Use the first button text
        }
        
        sections.push({
          heading: heading,
          links: [{
            name: linkName,
            quality: handleEmptyValue(data.quality),
            size: handleEmptyValue(data.size),
            links: data.links
            // Don't add notes here - notes will only come from nexdrive pages
          }]
        });
        console.log(`Created section with heading: "${heading}" and name: "${linkName}", quality: ${data.quality}, size: ${data.size}`);
      }
    } 
    // Fall back to direct links if headingMap is empty
    else if (directLinks.length > 0) {
      // Find the parent heading for these links, if any
      let headingText = "Download Links";
      const parentHeading = $('h5, h3').filter(function() {
        return $(this).next().find('a[href*="nexdrive"]').length > 0;
      });
      
      if (parentHeading.length > 0) {
        headingText = parentHeading.text().trim();
      }
      
      // Extract quality information from heading
      let headingQuality = '';
      if (headingText.includes('480p')) headingQuality = '480p';
      else if (headingText.includes('720p')) headingQuality = '720p';
      else if (headingText.includes('1080p')) headingQuality = '1080p';
      
      // Extract size if available in heading
      let headingSize = '';
      const sizeMatch = headingText.match(/\[([0-9.]+[MG]B)\/E\]/i) || 
                        headingText.match(/\[([0-9.]+[MG]B)\]/i);
      if (sizeMatch) {
        headingSize = sizeMatch[1];
      }
      
      // Get the first button text for name
      let linkName = "Download Now";
      if (directLinks.length > 0 && directLinks[0].buttonLabel) {
        linkName = directLinks[0].buttonLabel;
      }
      
      sections.push({
        heading: headingText,
        links: [{
          name: linkName,
          quality: handleEmptyValue(headingQuality),
          size: handleEmptyValue(headingSize),
          links: directLinks
          // Don't add notes here - notes will only come from nexdrive pages
        }]
      });
      console.log(`Created section with direct links: ${directLinks.length}, quality: ${headingQuality}, size: ${headingSize}`);
    }
  }
  
  // Now, visit nexdrive.lol links and extract actual download links
  const processedSections = [];
  
  // Create a deep copy of the sections array
  const originalSections = JSON.parse(JSON.stringify(sections));
  
  // Process each section to visit nexdrive links
  for (const section of originalSections) {
    // Create processed version of this section
    const processedSection = {
      heading: section.heading,
      links: []
    };
    
    // Process each link group in this section
    for (const linkGroup of section.links) {
      // Create processed version of this link group
      const processedLinkGroup = {
        name: linkGroup.name,
        quality: linkGroup.quality,
        size: linkGroup.size,
        links: []
      };
      
      // Special handling for Batch/Zip links
      if (linkGroup.name && linkGroup.name.includes('Batch/Zip') || 
          (linkGroup.links && linkGroup.links.some(link => link.buttonLabel && link.buttonLabel.includes('Batch/Zip')))) {
        
        console.log(`Processing Batch/Zip link group: ${linkGroup.name}`);
        
        // Extract size from the button label if available
        let zipSize = linkGroup.size || '';
        // Find button with Batch/Zip label to get the exact full text
        let batchZipName = "Batch/Zip";
        
        if (linkGroup.links && linkGroup.links.length > 0) {
          for (const link of linkGroup.links) {
            if (link.buttonLabel && link.buttonLabel.includes('Batch/Zip')) {
              // Use the full button label as the name
              batchZipName = link.buttonLabel;
              
              // Also extract size if not already found
              if (!zipSize) {
                const sizeMatch = link.buttonLabel.match(/\[([0-9.]+[MG]B)\]/i);
                if (sizeMatch) {
                  zipSize = sizeMatch[1];
                }
              }
              
              // We found what we need, no need to continue loop
              break;
            }
          }
        }
        
        // Create a specialized Batch/Zip format
        const batchZipLinks = {
          // Use the full button label text for the name field
          name: batchZipName,
          quality: linkGroup.quality || '',
          type: "Batch/Zip",
          size: zipSize,
          links: []
        };
        
        // Process each link to check if it's a nexdrive link
        for (const link of linkGroup.links) {
          if (link.link && (
            link.link.includes('nexdrive.lol') || 
            link.link.includes('gdtot') || 
            link.link.includes('gdflix') || 
            link.link.includes('driveleech')
          )) {
            try {
              console.log(`Processing Batch/Zip nexdrive link: ${link.link}`);
              
              // Visit the nexdrive page and extract actual download links
              const downloadLinks = await fetchNextdriveLinks(link.link, `Batch Zip ${zipSize}`);
              
              if (downloadLinks && downloadLinks.length > 0) {
                console.log(`Found ${downloadLinks.length} direct links from Batch/Zip nexdrive page`);
                
                // Process each link type and add to our batch zip format
                for (const dlLink of downloadLinks) {
                  if (dlLink.link) {
                    batchZipLinks.links.push({
                      buttonLabel: dlLink.buttonLabel || dlLink.type,
                      link: dlLink.link,
                      type: dlLink.type
                    });
                    console.log(`Added extracted link: ${dlLink.buttonLabel} (${dlLink.type})`);
                  } else if (dlLink.links && Object.keys(dlLink.links).length > 0) {
                    // Handle episode-specific links format (though rare in movie content)
                    for (const [episodeNum, episodeLink] of Object.entries(dlLink.links)) {
                      batchZipLinks.links.push({
                        buttonLabel: `${dlLink.buttonLabel || dlLink.type} [Episode ${episodeNum}]`,
                        link: episodeLink,
                        type: dlLink.type
                      });
                      console.log(`Added extracted episode link: ${dlLink.buttonLabel} [Episode ${episodeNum}]`);
                    }
                  }
                }
              } else {
                // If no download links found, keep the original nexdrive link
                console.log(`No download links found for ${link.link}, keeping original`);
                batchZipLinks.links.push(link);
              }
            } catch (error) {
              console.error(`Error processing Batch/Zip nexdrive link: ${error.message}`);
              // Keep the original link on error
              batchZipLinks.links.push(link);
            }
          } else {
            // For non-nexdrive links, keep them as-is
            batchZipLinks.links.push(link);
          }
        }
        
        // Add the processed batch zip group to the section if it has links
        if (batchZipLinks.links.length > 0) {
          processedSection.links.push(batchZipLinks);
        }
      }
      // Check if we have any nexdrive.lol links to process (non Batch/Zip)
      else if (linkGroup.links.some(link => 
        link.link && (
          link.link.includes('nexdrive.lol') || 
          link.link.includes('gdtot') || 
          link.link.includes('gdflix') || 
          link.link.includes('driveleech')
        )
      )) {
        console.log(`Found nexdrive links in group "${linkGroup.name}", processing...`);
        
        // Process each link in this group
        for (const link of linkGroup.links) {
          // Skip non-nexdrive links
          if (!link.link || (
            !link.link.includes('nexdrive.lol') && 
            !link.link.includes('gdtot') && 
            !link.link.includes('gdflix') && 
            !link.link.includes('driveleech')
          )) {
            // Keep non-nexdrive links as-is
            processedLinkGroup.links.push(link);
            continue;
          }
          
          // Process nexdrive link
          try {
            console.log(`Processing nexdrive link: ${link.link}`);
            
            // Visit the nexdrive page and extract actual download links
            const downloadLinks = await fetchNextdriveLinks(link.link, linkGroup.name);
            
            if (downloadLinks && downloadLinks.length > 0) {
              console.log(`Found ${downloadLinks.length} direct links from nexdrive page`);
              
              // Add all extracted download links to our processed group
              for (const dlLink of downloadLinks) {
                if (dlLink.link) {
                  processedLinkGroup.links.push({
                    buttonLabel: dlLink.buttonLabel || dlLink.type,
                    link: dlLink.link,
                    type: dlLink.type
                  });
                  console.log(`Added extracted link: ${dlLink.buttonLabel} (${dlLink.type})`);
                } else if (dlLink.links && Object.keys(dlLink.links).length > 0) {
                  // Handle episode-specific links format (though rare in movie content)
                  for (const [episodeNum, episodeLink] of Object.entries(dlLink.links)) {
                    processedLinkGroup.links.push({
                      buttonLabel: `${dlLink.buttonLabel || dlLink.type} [Episode ${episodeNum}]`,
                      link: episodeLink,
                      type: dlLink.type
                    });
                    console.log(`Added extracted episode link: ${dlLink.buttonLabel} [Episode ${episodeNum}]`);
                  }
                }
              }
            } else {
              // If no download links found, keep the original nexdrive link
              console.log(`No download links found for ${link.link}, keeping original`);
              processedLinkGroup.links.push(link);
            }
          } catch (error) {
            console.error(`Error processing nexdrive link: ${error.message}`);
            // Keep the original link on error
            processedLinkGroup.links.push(link);
          }
        }
      } else {
        // If no nexdrive links, keep all links as-is
        processedLinkGroup.links = linkGroup.links;
      }
      
      // Add the processed link group to the section (only for non Batch/Zip links)
      if (processedLinkGroup.links.length > 0 && !(linkGroup.name && linkGroup.name.includes('Batch/Zip'))) {
        processedSection.links.push(processedLinkGroup);
      }
    }
    
    // Add the processed section to our result
    if (processedSection.links.length > 0) {
      processedSections.push(processedSection);
    }
  }
  
  // Update link found count
  if (linksFound > 0) {
    logger.updateLinkProgress(linksFound, linksFound);
  }
  
  // Return the processed sections with actual download links
  return processedSections.length > 0 ? processedSections : sections;
}

// Utility function to handle empty strings
function emptyToNull(value) {
  return value === '' || value === undefined ? null : value;
}

// Add these helper functions before processFallbackLinks
function extractImdbRating($) {
  // Try to find IMDb link with rating in anchor text
  const imdbAnchor = $('a[href*="imdb.com"]');
  if (imdbAnchor.length) {
    const anchorText = imdbAnchor.text().trim();
    const ratingMatch = anchorText.match(/([0-9.]+\/10)/i);
    if (ratingMatch && ratingMatch[1]) {
      return ratingMatch[1].trim();
    }
  }
  
  // Look for IMDb rating in text containing both "IMDb" and "Rating"
  const imdbElement = $('*:contains("IMDb Rating")');
  if (imdbElement.length) {
    for (let i = 0; i < imdbElement.length; i++) {
      const imdbText = $(imdbElement[i]).text();
      const imdbMatch = imdbText.match(/IMDb Rating\s*:?-?\s*([0-9.]+\/10)/i) || 
                      imdbText.match(/👉\s*IMDb Rating\s*:?-?\s*([0-9.]+\/10)/i);
      
      if (imdbMatch && imdbMatch[1]) {
        return imdbMatch[1].trim();
      }
    }
  }
  
  // Look for text with an IMDb emoji followed by rating
  const emojiElements = $('*:contains("👉")');
  if (emojiElements.length) {
    for (let i = 0; i < emojiElements.length; i++) {
      const text = $(emojiElements[i]).text();
      if (text.includes('IMDb')) {
        const ratingMatch = text.match(/([0-9.]+\/10)/i);
        if (ratingMatch && ratingMatch[1]) {
          return ratingMatch[1].trim();
        }
      }
    }
  }
  
  return '-';
}

function extractMovieName($) {
  const title = $('h1.post-title').text().trim();
  const match = title.match(/Download\s+(.+?)\s+\((\d{4})\)/);
  return emptyToNull(match ? match[1].trim() : '');
}

function extractSeriesName($) {
  let seriesName = '';
  $('p, div').each(function() {
    const text = $(this).text().trim();
    if (text.includes('Series Name:')) {
      const match = text.match(/Series Name\s*:?\s*(.+?)(?:$|\\n|\n|<br>|Season)/);
      if (match) seriesName = match[1].trim();
    }
  });
  return emptyToNull(seriesName);
}

function extractSeason($) {
  let season = '';
  $('p, div').each(function() {
    const text = $(this).text().trim();
    if (text.includes('Season:')) {
      const match = text.match(/Season\s*:?\s*(.+?)(?:$|\\n|\n|<br>|Episode)/);
      if (match) season = match[1].trim();
    }
  });
  return emptyToNull(season);
}

function extractEpisode($) {
  let episode = '';
  $('p, div').each(function() {
    const text = $(this).text().trim();
    if (text.includes('Episode:')) {
      const match = text.match(/Episode\s*:?\s*(.+?)(?:$|\\n|\n|<br>|Language)/);
      if (match) episode = match[1].trim();
    }
  });
  return emptyToNull(episode);
}

function extractReleaseYear($) {
  let year = '';
  $('p, div').each(function() {
    const text = $(this).text().trim();
    if (text.includes('Released Year:') || text.includes('Release Year:')) {
      const match = text.match(/Releas(?:ed|e) Year\s*:?\s*(.+?)(?:$|\\n|\n|<br>|Episode Size)/);
      if (match) year = match[1].trim();
    }
  });
  return emptyToNull(year);
}

function extractLanguage($) {
  let language = '';
  $('p, div').each(function() {
    const text = $(this).text().trim();
    if (text.includes('Language:')) {
      const match = text.match(/Language\s*:?\s*(.+?)(?:$|\\n|\n|<br>|Subtitle)/);
      if (match) language = match[1].trim();
    }
  });
  return emptyToNull(language);
}

function extractSubtitle($) {
  let subtitle = '';
  $('p, div').each(function() {
    const text = $(this).text().trim();
    if (text.includes('Subtitle:')) {
      const match = text.match(/Subtitle\s*:?\s*(.+?)(?:$|\\n|\n|<br>|Released)/);
      if (match) subtitle = match[1].trim();
    }
  });
  return emptyToNull(subtitle) || 'English';
}

function extractSize($) {
  let size = '';
  $('p, div').each(function() {
    const text = $(this).text().trim();
    if (text.includes('Size:')) {
      const match = text.match(/Size\s*:?\s*(.+?)(?:$|\\n|\n|<br>|Format)/);
      if (match) size = match[1].trim();
    }
  });
  return emptyToNull(size);
}

function extractEpisodeSize($) {
  let size = '';
  $('p, div').each(function() {
    const text = $(this).text().trim();
    if (text.includes('Episode Size:')) {
      const match = text.match(/Episode Size\s*:?\s*(.+?)(?:$|\\n|\n|<br>|Complete)/);
      if (match) size = match[1].trim();
    }
  });
  return emptyToNull(size);
}

function extractCompleteZip($) {
  let zip = '';
  $('p, div').each(function() {
    const text = $(this).text().trim();
    if (text.includes('Complete Zip:')) {
      const match = text.match(/Complete Zip\s*:?\s*(.+?)(?:$|\\n|\n|<br>|Quality)/);
      if (match) zip = match[1].trim();
    }
  });
  return emptyToNull(zip);
}

function extractQuality($) {
  let quality = '';
  $('p, div').each(function() {
    const text = $(this).text().trim();
    if (text.includes('Quality:')) {
      const match = text.match(/Quality\s*:?\s*(.+?)(?:$|\\n|\n|<br>|Format)/);
      if (match) quality = match[1].trim();
    }
  });
  return emptyToNull(quality);
}

function extractFormat($) {
  let format = '';
  $('p, div').each(function() {
    const text = $(this).text().trim();
    if (text.includes('Format:')) {
      const match = text.match(/Format\s*:?\s*(.+?)(?:$|\\n|\n|<br>|Synopsis)/);
      if (match) format = match[1].trim();
    }
  });
  return emptyToNull(format) || 'MKV';
}

function extractSynopsis($) {
  let synopsis = '';
  const synopsisHeading = $('h2, h3, h4').filter((i, el) => {
    return $(el).text().toLowerCase().includes('synopsis') || 
           $(el).text().toLowerCase().includes('plot');
  });
  
  if (synopsisHeading.length) {
    const synopsisPara = synopsisHeading.next('p');
    if (synopsisPara.length) {
      synopsis = synopsisPara.text().trim();
    }
  }
  
  if (!synopsis) {
    $('p').each(function() {
      const text = $(this).text().trim();
      if ((text.startsWith('📰') || text.length > 100) && 
          !text.includes('Download') && !text.includes('uploads')) {
        synopsis = text;
        return false;
                }
              });
            }
  
  return emptyToNull(synopsis);
}

function extractScreenshots($) {
  let screenshots = [];
  
  // Method 1: Look for screenshots after a heading with "screenshot" text
  $('h2, h3, h4').each(function() {
    const headingText = $(this).text().toLowerCase();
    if (headingText.includes('screenshot')) {
      console.log('Found screenshot heading:', $(this).text());
      
      // Get the next paragraph with images
      const nextParagraph = $(this).next('p');
      if (nextParagraph.length > 0) {
        nextParagraph.find('img').each(function() {
          const src = $(this).attr('src');
          if (src) {
            screenshots.push(src);
            console.log('Found screenshot under heading:', src);
          }
        });
      }
    }
  });
  
  // If no screenshots found with Method 1, try Method 2 (original method)
  if (screenshots.length === 0) {
    console.log('No screenshots found after headings, trying fallback method');
    
    $('img').each(function() {
      const src = $(this).attr('src');
      if (src && (src.includes('imgbb.top/ib/') || 
                 src.includes('decoding="async"') || 
                 src.includes('i.imgur.com'))) {
        if (!src.includes('poster') && 
            !src.includes('banner') && 
            !src.includes('logo') && 
            !src.includes('favicon')) {
          screenshots.push(src);
          console.log('Found screenshot with fallback method:', src);
        }
      }
    });
  }
  
  console.log(`Found ${screenshots.length} screenshots total`);
  return screenshots;
}

// Function to extract movie_note (comes after screenshots section)
function extractMovieNote($) {
  const movieNotes = [];
  
  // Find the screenshot images first
  const screenshotImg = $('p img').filter(function() {
    const src = $(this).attr('src');
    return src && (src.includes('imgbb.top/ib/') || src.includes('decoding="async"'));
  });
  
  // If screenshots exist, look at subsequent paragraphs until we hit an hr tag
  if (screenshotImg.length > 0) {
    const screenshotPara = screenshotImg.closest('p');
    let nextElement = screenshotPara.next();
    
    // Process elements until we hit an hr tag
    while (nextElement.length > 0 && !nextElement.is('hr')) {
      // Check if this is a paragraph with centered text
      if (nextElement.is('p') && nextElement.attr('style') && 
          nextElement.attr('style').includes('text-align: center')) {
        const noteText = nextElement.text().trim();
            if (noteText) {
          movieNotes.push(noteText);
        }
      }
      
      // Move to the next element
      nextElement = nextElement.next();
    }
  }
  
  // If we still haven't found any movie notes, look for all centered paragraphs with download text
  if (movieNotes.length === 0) {
    $('p[style*="text-align: center"]').each(function() {
      const text = $(this).text().trim();
      if (text.includes('DOWNLOAD') || text.includes('हिंदी') || text.includes('डब्बड')) {
        movieNotes.push(text);
      }
    });
  }
  
  return movieNotes;
}

// Add this new function before getMovieDetails
async function processFallbackLinks($, content) {
  console.log('Processing fallback link extraction...');
  const sections = [];
  const links = [];

  // Focus on .entry-inner container
  $('.entry-inner p').each((i, el) => {
    const $el = $(el);
    const $links = $el.find('a');
    
    // Only process paragraphs that have multiple links
    if ($links.length > 0) {
      const sectionLinks = [];
      
      $links.each((j, linkEl) => {
        const $link = $(linkEl);
        const href = $link.attr('href');
        
        if (href) {
          // Get button text if exists, otherwise use link text
          const buttonText = $link.find('button').text().trim() || $link.text().trim() || 'Download';
          
          sectionLinks.push({
            buttonLabel: buttonText,
                      link: href
                    });
          
          console.log(`Found link: ${buttonText} -> ${href}`);
        }
      });

      if (sectionLinks.length > 0) {
        sections.push({
          heading: "Download Links",
          links: [{
            name: "Direct Downloads",
            links: sectionLinks
          }]
              });
            }
          }
  });

  return sections.length > 0 ? sections : null;
}

// Helper function to clean URL by removing domain
function cleanUrl(url) {
  if (!url) return '';
  // If URL doesn't start with http or https, try to add the domain
  if (!url.startsWith('http')) {
    const apiUrl = config.api.rootUrl;
    return `${apiUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }
  // Return the full URL
  return url;
}

// Helper function to clean thumbnail path
function cleanThumbnail(thumbnail) {
  if (!thumbnail) return '';
  
  // Strip domain part (e.g., https://app.vegamovies.bot/) and keep only the path
  if (thumbnail.includes('://')) {
    try {
      const urlObj = new URL(thumbnail);
      return urlObj.pathname.replace(/^\/+/, ''); // Remove leading slashes
    } catch (err) {
      console.error('Error parsing thumbnail URL:', err);
      // If URL parsing fails, try to remove common domain patterns
      return thumbnail.replace(/^https?:\/\/[^\/]+\//, '');
    }
  }
  
  // Already a relative path, just clean leading slashes
  return thumbnail.replace(/^\/+/, '');
}

// Helper function to clean movie data
function cleanMovieData(movie) {
  // Helper function to recursively handle empty strings in an object
  function handleEmptyStrings(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => handleEmptyStrings(item));
    }
    
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip 'page' field
      if (key === 'page') continue;
      
      if (value === '') {
        result[key] = null;
      } else if (typeof value === 'object' && value !== null) {
        result[key] = handleEmptyStrings(value);
        } else {
        result[key] = value;
      }
    }
    return result;
  }
  
  // First convert any empty strings to null and remove the page field
  const movieWithoutPage = { ...movie };
  delete movieWithoutPage.page;
  
  // Return the cleaned movie with full URLs preserved
  return handleEmptyStrings(movieWithoutPage);
}

// Update getMovieList function to handle empty arrays correctly
async function getMovieList(page = 1) {
  try {
    // Tracking calls removed
    // await track.startPageProcessing(page);

    // Make sure we have a valid API URL
    const apiUrl = config.api.rootUrl;
    const url = `${apiUrl}/page/${page}/`;
    console.log(`Fetching movie list from: ${url}`);
    const content = await httpClient.getContentWithGot(url);
    
    if (!content) {
      console.log('No content found for page', page);
      // Tracking call removed
      // await track.updateMoviesFound(page, 0);
      return { movies: [], total: 0, page };
    }

    const $ = cheerio.load(content);
    const movieElements = [];
    
    // First collect all movie elements
    $('.entry-title a').each((i, element) => {
      movieElements.push(element);
    });

    // Check if we have any movies
    if (movieElements.length === 0) {
      console.log(`No movies found on page ${page}`);
      // Tracking call removed
      // await track.updateMoviesFound(page, 0);
      return { movies: [], total: 0, page };
    }

    // Determine the direction based on current processing flow
    // For individual pages, always process from first to last unless reversed manually
    // const shouldReverseOrder = page > 1; // Reverse order for pages 2+
    const shouldReverseOrder = true; // always reverse order
    
    if (shouldReverseOrder) {
      movieElements.reverse();
      console.log(`Found ${movieElements.length} movies on page ${page}, processing in reverse order (last to first)`);
    } else {
      console.log(`Found ${movieElements.length} movies on page ${page}, processing in order (first to last)`);
    }

    // Tracking call removed
    // await track.updateMoviesFound(page, movieElements.length);

    const movies = [];
    // Process movies one by one
    for (let i = 0; i < movieElements.length; i++) {
      const element = $(movieElements[i]);
      const title = element.text().trim();
      const url = cleanUrl(element.attr('href'));
      
      // Get the article element that contains this movie
      const article = element.closest('article');
      
      // Extract date using multiple approaches (in order of preference)
      let date = '';
      
      // Method 1: Get date from time element with datetime attribute (most reliable)
      const timeElement = article.find('time.published');
      if (timeElement.length > 0) {
        // First try to get the datetime attribute
        const datetime = timeElement.attr('datetime');
        if (datetime) {
          date = new Date(datetime).toISOString();
        } else {
          // Fallback to the text content of the time element
          date = timeElement.text().trim();
        }
      }
      
      // Method 2: Fallback to post-byline element
      if (!date) {
        const bylineElement = article.find('.post-byline');
        if (bylineElement.length > 0) {
          // Try to find a time element inside the byline
          const bylineTime = bylineElement.find('time');
          if (bylineTime.length > 0) {
            date = bylineTime.text().trim();
      } else {
            // Just get the text of the byline
            date = bylineElement.text().trim();
          }
        }
      }
      
      // Method 3: Look for any element with date-related classes
      if (!date) {
        const dateElement = article.find('.entry-date, .date, .published');
        if (dateElement.length > 0) {
          date = dateElement.text().trim();
        }
      }
      
      const thumbnail = cleanThumbnail(article.find('img').attr('src'));
      
      if (title && url) {
        // Store page separately for tracking but don't include it in the final movie object for database
        movies.push({ 
          title, 
          url, 
          date, 
          thumbnail, 
          page // Keep page temporarily for tracking, will be removed before storage
        });
      }
    }

    // Return the results with page context
    return { 
      movies, 
      total: movies.length,
      page
    };
  } catch (error) {
    console.error('Error in getMovieList:', error);
    // Update status to reflect error
    await track.updatePageError(page);
    return { movies: [], total: 0, page };
  }
}

// Add this function with the other extraction functions
function extractDetails($) {
  const details = [];
  
  // Get the first paragraph in the entry-inner div
  const firstPara = $('.entry-inner p').first();
  if (firstPara.length > 0) {
    const text = firstPara.text().trim();
    if (text && text.length > 0) {
      details.push(text);
    }
  }
  
  return details;
}

// Update parseMovieInfo function to completely skip nexdrive link processing if movie exists
async function parseMovieInfo($, movie, options = {}) {
  try {
    // First normalize the URL to check database
    const normalizedUrl = urlUtils.normalizeUrl(movie.url);
    
    // Check if movie already exists in database before parsing
    let existingMovie = null;
    if (typeof db.getMovieByUrl === 'function') {
      existingMovie = await db.getMovieByUrl(normalizedUrl);
    } else {
      const result = await db.getAllMovies(1, 1, { url: normalizedUrl });
      if (result && result.movies && result.movies.length > 0) {
        existingMovie = result.movies[0];
      }
    }
    
    if (existingMovie && !options.forceUpdate) {
      console.log(`Movie "${movie.title}" already exists in database, skipping nexdrive processing completely`);
      return null; // Return null to signal movie exists but shouldn't be processed
    }
    
    // Extract movie name and series name first to determine content type
    const extractedMovieName = extractMovieName($);
    const extractedSeriesName = extractSeriesName($);
    
    // Determine if this is a movie or series
    let contentType = "movie"; // Default to movie
    if (extractedSeriesName && extractedSeriesName.length > 0) {
      contentType = "series";
    } else if (extractedMovieName && extractedMovieName.length > 0) {
      contentType = "movie";
    }
    
    const info = {
      imdb_rating: extractImdbRating($),
      movie_or_series: contentType,
      // We'll store the actual name in title field, removing movie_name and series_name
      title: contentType === "series" ? extractedSeriesName : extractedMovieName,
      season: extractSeason($),
      episode: extractEpisode($),
      release_year: extractReleaseYear($),
      language: extractLanguage($),
      subtitle: extractSubtitle($),
      size: extractSize($),
      episode_size: extractEpisodeSize($),
      complete_zip: extractCompleteZip($),
      quality: extractQuality($),
      format: extractFormat($),
      details: extractDetails($),
      synopsis: extractSynopsis($),
      screenshots: extractScreenshots($),
      movie_notes: extractMovieNote($),
      sections: []
    };

    // Process nexdrive links if movie doesn't exist or we're forcing an update
    try {
      // Process download sections
      let sections = [];
      
      // Process nexdrive links (will fetch deeper links)
      sections = await processNexdriveLinks($('main'), $);
      
      if (sections && sections.length > 0) {
        info.sections = sections;
        
        // Count direct download links found
        let totalDirectLinks = 0;
        let fastdlLinks = 0;
        let vcloudLinks = 0;
        let filepressLinks = 0;
        let dropgalaxyLinks = 0;
        let otherLinks = 0;
        
        // Log statistics about the links we found
        sections.forEach(section => {
          if (section.links && section.links.length > 0) {
            section.links.forEach(group => {
              if (group.links && group.links.length > 0) {
                group.links.forEach(link => {
                  // Make sure link object has a link property
                  if (link && link.link) {
                    totalDirectLinks++;
                    
                    if (link.link.includes('fastdl.icu')) {
                      fastdlLinks++;
                    } else if (link.link.includes('vcloud.lol')) {
                      vcloudLinks++;
                    } else if (link.link.includes('filebee.xyz') || link.link.includes('filepress.icu')) {
                      filepressLinks++;
                    } else if (link.link.includes('dgdrive.pro') || link.link.includes('dgdrive.site')) {
                      dropgalaxyLinks++;
                    } else {
                      otherLinks++;
                    }
                  }
                });
              }
            });
          }
        });
        
        console.log(`\n=== Download Links Summary ===`);
        console.log(`Total direct download links: ${totalDirectLinks}`);
        console.log(`Fastdl.icu links: ${fastdlLinks}`);
        console.log(`Vcloud.lol links: ${vcloudLinks}`);
        console.log(`Filepress links: ${filepressLinks}`);
        console.log(`DropGalaxy links: ${dropgalaxyLinks}`);
        console.log(`Other links: ${otherLinks}`);
      } else {
        // If processNexdriveLinks failed, try the fallback
        sections = await processFallbackLinks($, $('main').html()) || [];
        if (sections && sections.length > 0) {
          info.sections = sections;
        }
      }
    } catch (e) {
      console.error('Error processing download links:', e);
      // Try fallback if nexdrive processing fails
      const fallbackSections = await processFallbackLinks($, $('main').html()) || [];
      if (fallbackSections && fallbackSections.length > 0) {
        info.sections = fallbackSections;
      }
    }

    return info;
  } catch (error) {
    console.error('Error parsing movie info:', error);
    return null;
  }
}

// Update getMovieDetails function to handle null from parseMovieInfo
async function getMovieDetails(movie, options = {}) {
  try {
    const movieUrl = movie.url;
    console.log(`\nChecking database for existing movie: ${movie.title}`);
    
    // First normalize the URL to check database
    const normalizedUrl = urlUtils.normalizeUrl(movieUrl);
    
    // Check if movie already exists in database
    let existingMovie = null;
    if (typeof db.getMovieByUrl === 'function') {
      existingMovie = await db.getMovieByUrl(normalizedUrl);
    } else {
      // Fallback to getAllMovies with URL filter
      const result = await db.getAllMovies(1, 1, { url: normalizedUrl });
      if (result && result.movies && result.movies.length > 0) {
        existingMovie = result.movies[0];
      }
    }
    
    if (existingMovie && !options.forceUpdate) {
      console.log(`Movie "${movie.title}" already exists in database, completely skipping network request`);
      return existingMovie;
    }
    
    // If we get here, either the movie doesn't exist yet or we're forcing an update, so fetch it from the network
    console.log(`Fetching details for: ${movie.title}`);
    console.log(`URL: ${movieUrl}`);
    
    // Ensure the URL is valid
    let url = movieUrl;
    if (!url.startsWith('http')) {
      // Check if we have a valid API URL to prepend
      const apiUrl = config.api.rootUrl;
      url = `${apiUrl}${url.startsWith('/') ? '' : '/'}${url}`;
      console.log(`Using full URL: ${url}`);
    }
    
    const content = await httpClient.getContentWithGot(url);
    
    if (!content) {
      console.log('No content found for movie URL:', url);
      return null;
    }
    
    const $ = cheerio.load(content);
    const movieInfo = await parseMovieInfo($, movie, { forceUpdate: options.forceUpdate });
    
    // If parseMovieInfo returns null, it means the movie already exists
    if (movieInfo === null) {
      // Check again in case parseMovieInfo found it
      if (!existingMovie) {
        existingMovie = await db.getMovieByUrl(normalizedUrl);
      }
      
      if (existingMovie) {
        console.log(`Movie "${movie.title}" found during content parsing, returning existing record`);
        return existingMovie;
      }
      
      return null;
    }
    
    if (movieInfo) {
      // Create a copy without the page field for database storage
      const { page, ...movieWithoutPage } = movie;
      
      const movieWithDetails = cleanMovieData({
        ...movieWithoutPage,
        info: [movieInfo]
      });

      try {
        // Save to database with the forceUpdate option
        await db.saveMovie(movieWithDetails, { forceUpdate: options.forceUpdate });
        return movieWithDetails;
      } catch (error) {
        console.error(`Error saving movie "${movie.title}" to database:`, error);
        return movieWithDetails; // Still return the details even though it wasn't saved
      }
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error in getMovieDetails:', error);
    return null;
  }
}

// Add this custom getMovieInfoWithoutNexdrive function that will be used when the movie exists
async function parseMovieInfoWithoutNexdrive($, movie) {
  try {
    // First normalize the URL to check database
    const normalizedUrl = urlUtils.normalizeUrl(movie.url);
    
    // Check if movie already exists in database before parsing
    let existingMovie = null;
    if (typeof db.getMovieByUrl === 'function') {
      existingMovie = await db.getMovieByUrl(normalizedUrl);
    } else {
      const result = await db.getAllMovies(1, 1, { url: normalizedUrl });
      if (result && result.movies && result.movies.length > 0) {
        existingMovie = result.movies[0];
      }
    }
    
    if (existingMovie) {
      console.log(`Movie "${movie.title}" already exists in database, skipping content parsing`);
      return null; // Return null to signal movie exists but shouldn't be processed
    }
    
    // Extract movie name and series name first to determine content type
    const extractedMovieName = extractMovieName($);
    const extractedSeriesName = extractSeriesName($);
    
    // Determine if this is a movie or series
    let contentType = "movie"; // Default to movie
    if (extractedSeriesName && extractedSeriesName.length > 0) {
      contentType = "series";
    } else if (extractedMovieName && extractedMovieName.length > 0) {
      contentType = "movie";
    }
    
    const info = {
      imdb_rating: extractImdbRating($),
      movie_or_series: contentType,
      // We'll store the actual name in title field, removing movie_name and series_name
      title: contentType === "series" ? extractedSeriesName : extractedMovieName,
      season: extractSeason($),
      episode: extractEpisode($),
      release_year: extractReleaseYear($),
      language: extractLanguage($),
      subtitle: extractSubtitle($),
      size: extractSize($),
      episode_size: extractEpisodeSize($),
      complete_zip: extractCompleteZip($),
      quality: extractQuality($),
      format: extractFormat($),
      details: extractDetails($),
      synopsis: extractSynopsis($),
      screenshots: extractScreenshots($),
      movie_notes: extractMovieNote($),
      sections: [] // Skip nexdrive link processing completely for existing movies
    };

    return info;
  } catch (error) {
    console.error('Error parsing movie info:', error);
    return null;
  }
}

// Simplified saveMoviesToJson function - now just a stub that does nothing
async function saveMoviesToJson(movies) {
  // This function is now a no-op
  return true;
}

// Function to save movie to database
async function saveMovieToDatabase(movie) {
  try {
    // Ensure database is initialized
    await db.initializeDatabase();
    
    await db.saveMovie(movie);
    console.log(`Saved movie "${movie.title}" to SQLite database`);
    return true;
  } catch (error) {
    console.error(`Error saving "${movie.title}" to database:`, error.message);
    return false;
  }
}

// New function to fetch all download links from a Nexdrive page
async function fetchNextdriveLinks(url, heading = null) {
  if (!url) return [];
  
  try {
    console.log(`Fetching ${url}...`);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': config.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': `${config.api.rootUrl}/`,
      }
    });
    
    // Save HTML content to file for debugging (handle errors gracefully)
    try {
      const pageName = heading ? `nexdrive_${heading.replace(/\s+/g, '_')}` : null;
      const savedPath = saveHtmlContent(response.data, url, pageName);
      if (savedPath) {
        console.log(`HTML content saved to ${savedPath}`);
      }
    } catch (htmlError) {
      console.error(`Error saving HTML content: ${htmlError.message}`);
      // Continue processing even if HTML saving fails
    }
    
    const $ = cheerio.load(response.data);

    // Helper function to determine button type
    function getButtonType(buttonText) {
      if (!buttonText) return 'Download';
      
      if (buttonText.includes('G-Direct')) return 'G-Direct';
      if (buttonText.includes('V-Cloud')) return 'V-Cloud';
      if (buttonText.includes('GDToT')) return 'GDToT';
      if (buttonText.includes('Filepress')) return 'Filepress';
      if (buttonText.includes('DropGalaxy')) return 'DropGalaxy';
      if (buttonText.includes('Batch/Zip')) return 'Batch/Zip';
      return 'Download';
    }
    
    // Look for episode-specific headings like "-:Episodes: 1:-"
    const episodeHeadings = [];
    
    // Look for heading elements with episode format (more specific pattern matching)
    $('.entry.themeform h1, .entry.themeform h2, .entry.themeform h3, .entry.themeform h4, .entry.themeform h5').each(function() {
      const headingText = $(this).text().trim();
      // More precise episode pattern matching
      const episodeMatch = headingText.match(/-\s*:\s*Episodes?\s*:?\s*(\d+)\s*:-/i) || 
                           headingText.match(/Episodes?\s*:?\s*(\d+)/i) ||
                           headingText.match(/Episode\s+(\d+)/i);
      
      if (episodeMatch) {
        const episodeNumber = episodeMatch[1];
        episodeHeadings.push({
          heading: headingText,
          number: episodeNumber,
          element: $(this)
        });
        console.log(`Found episode heading: ${headingText} (Episode ${episodeNumber})`);
      }
    });
    
    // Check if page content has episode markers
    const pageContent = $('.entry.themeform').text();
    const hasEpisodeText = /episode\s*\d+/i.test(pageContent) || 
                           /season\s*\d+\s*episode/i.test(pageContent) ||
                           /[Ss]\d+[Ee]\d+/i.test(pageContent);
    
    // Check if heading contains episode information
    let headingEpisodeNum = null;
    if (heading) {
      const episodeMatch = heading.match(/Episode[s]*[:\s-]+(\d+)/i) ||
                           heading.match(/E(\d+)/i);
      if (episodeMatch) {
        headingEpisodeNum = episodeMatch[1];
        console.log(`Found episode number in heading: ${headingEpisodeNum}`);
      }
    }
    
    // If we found episode headings, organize links by button type
    if (episodeHeadings.length > 0) {
      console.log(`Found ${episodeHeadings.length} episode headings in content`);
      
      // Initialize structure to hold all button types
      const buttonTypes = {};
      
      // Process each episode heading to extract links and associate with correct episode numbers
      for (const episode of episodeHeadings) {
        const episodeNum = episode.number;
        
        // Look for links after the heading until the next heading or horizontal rule
        let currentEl = episode.element;
        let foundLinks = false;
        
        // Continue until we find the next heading, hr, or run out of elements
        while ((currentEl = currentEl.next()).length > 0) {
          // Stop if we hit another heading or hr
          if (currentEl.is('h1, h2, h3, h4, h5, h6, hr')) {
            break;
          }
          
          // Find all links in the current element
          currentEl.find('a').each(function() {
            const link = $(this);
            const href = link.attr('href');
            
            if (href && !href.includes('#') && href !== url) {
              foundLinks = true;
              // Extract button text
              const button = link.find('button');
              const buttonText = button.length > 0 ? button.text().trim() : link.text().trim();
              const buttonType = getButtonType(buttonText);
              
              // Initialize this button type if not exists
              if (!buttonTypes[buttonType]) {
                buttonTypes[buttonType] = {
                  buttonLabel: buttonText || `${buttonType} Button`,
                  type: buttonType,
                  links: {}
                };
              }
              
              // Add this link to the appropriate episode number
              buttonTypes[buttonType].links[episodeNum] = href;
              console.log(`Found direct download link for Episode ${episodeNum}: ${buttonText || 'Download Now'} -> ${href}`);
            }
          });
        }
        
        // If no links found in subsequent elements, try searching for links with no clear parent-child relationship
        if (!foundLinks) {
          // Some pages have button groups that aren't directly related to the headings
          // Try to find all buttons in the page and associate them with episodes based on proximity
          const buttonGroups = {};
          
          // First collect all potential button groups
          $('.entry.themeform a, .entry.themeform button').each(function() {
            const element = $(this);
            const text = element.text().trim();
            const buttonType = getButtonType(text);
            
            if (buttonType) {
              if (!buttonGroups[buttonType]) {
                buttonGroups[buttonType] = [];
              }
              
              const href = element.attr('href');
              if (href && !href.includes('#') && href !== url) {
                buttonGroups[buttonType].push({
                  text,
                  href,
                  element
                });
              }
            }
          });
          
          // For each button type, try to find a button that corresponds to this episode
          for (const [buttonType, buttons] of Object.entries(buttonGroups)) {
            // If we have exactly the same number of buttons as episodes, assume they match 1:1
            if (buttons.length === episodeHeadings.length) {
              const idx = episodeHeadings.findIndex(ep => ep.number === episodeNum);
              if (idx >= 0 && idx < buttons.length) {
                const button = buttons[idx];
                
                // Initialize this button type if not exists
                if (!buttonTypes[buttonType]) {
                  buttonTypes[buttonType] = {
                    buttonLabel: button.text || `${buttonType} Button`,
                    type: buttonType,
                    links: {}
                  };
                }
                
                // Add this link to the appropriate episode number
                buttonTypes[buttonType].links[episodeNum] = button.href;
                console.log(`Found direct download link for Episode ${episodeNum} (by matching count): ${button.text || 'Download Now'} -> ${button.href}`);
                foundLinks = true;
              }
            }
          }
        }
      }
      
      // Return array of button types with their links
      return Object.values(buttonTypes);
    } else {
      // Handle non-episodic content (like movies or zip packs)
      const buttonTypes = {};
      
      // Process buttons/links by type (e.g., G-Direct, V-Cloud, etc.)
      const buttonLabels = ['G-Direct', 'V-Cloud', 'DropGalaxy', 'GDToT', 'Filepress', 'Batch/Zip'];
      
      // Look for distinct button types and collect their links
      buttonLabels.forEach(label => {
        const buttons = $(`.entry.themeform a:contains("${label}")`);
        if (buttons.length > 0) {
          console.log(`Found ${buttons.length} ${label} buttons`);
          
          // If we found buttons of this type, add them to our collection
          buttons.each(function() {
            const button = $(this);
            const href = button.attr('href');
            
            if (href && !href.includes('#') && href !== url) {
              // Get complete button text including size information
              const buttonText = button.text().trim();
              const buttonType = getButtonType(buttonText);
              
              // Initialize this button type if not exists
              if (!buttonTypes[buttonType]) {
                buttonTypes[buttonType] = {
                  // Use the full button text including size information
                  buttonLabel: buttonText || `${buttonType} Button`,
                  type: buttonType
                };
                
                // Determine if we should use links object or direct link
                if (headingEpisodeNum || hasEpisodeText) {
                  // Only use episodic format if we have episode info
                  buttonTypes[buttonType].links = {};
                  buttonTypes[buttonType].links[headingEpisodeNum || '1'] = href;
                  console.log(`Found ${buttonType} link for Episode ${headingEpisodeNum || '1'}: ${buttonText || 'Download Now'} -> ${href}`);
                } else {
                  // For non-episode content, use direct link
                  buttonTypes[buttonType].link = href;
                  console.log(`Found ${buttonType} link (non-episode): ${buttonText || 'Download Now'} -> ${href}`);
                }
              } else {
                // If this button type already exists, add the link
                if (buttonTypes[buttonType].links) {
                  // For episodic content, add to links object
                  if (headingEpisodeNum || hasEpisodeText) {
                    buttonTypes[buttonType].links[headingEpisodeNum || '1'] = href;
                    console.log(`Found additional ${buttonType} link for Episode ${headingEpisodeNum || '1'}: ${buttonText || 'Download Now'} -> ${href}`);
                  }
                } else {
                  // For non-episode content, prefer the first link found
                  console.log(`Additional ${buttonType} link found but using first one: ${buttonText || 'Download Now'} -> ${href}`);
                }
              }
            }
          });
        }
      });
      
      // If no structured buttons found, fall back to processing all links
      if (Object.keys(buttonTypes).length === 0) {
        $('.entry.themeform a').each(function() {
          const link = $(this);
          const href = link.attr('href');
          
          if (href && !href.includes('#') && href !== url) {
            // Get button text or use anchor text if no button
            const button = link.find('button');
            // Get the full text with size information
            const buttonText = button.length > 0 ? button.text().trim() : link.text().trim();
            const buttonType = getButtonType(buttonText);
            
            // Initialize the button type entry if it doesn't exist
            if (!buttonTypes[buttonType]) {
              buttonTypes[buttonType] = {
                // Use the full button text including size information
                buttonLabel: buttonText || `${buttonType} Button`,
                type: buttonType
              };
              
              // Determine if we should use links object or direct link
              if (headingEpisodeNum || hasEpisodeText) {
                // Only use episodic format if we have episode info
                buttonTypes[buttonType].links = {};
                buttonTypes[buttonType].links[headingEpisodeNum || '1'] = href;
                console.log(`Found ${buttonType} link for Episode ${headingEpisodeNum || '1'}: ${buttonText || 'Download Now'} -> ${href}`);
              } else {
                // For non-episode content, use direct link
                buttonTypes[buttonType].link = href;
                console.log(`Found ${buttonType} link (non-episode): ${buttonText || 'Download Now'} -> ${href}`);
              }
            }
          }
        });
      }
      
      // Return array of button types
      const standardResults = Object.values(buttonTypes);
      
      // FALLBACK: If no links found through conventional methods, try direct button extraction
      // This section will catch the new button UI on nexdrive.lol pages
      if (standardResults.length === 0) {
        console.log('No links found with standard extraction, trying fallback button extraction...');
        const extractedLinks = [];
        
        // Look for buttons with specific classes used in new nexdrive UI
        $('.btn.btn-sm.btn-outline, .sml-button').each(function() {
          // Find the parent <a> tag that contains the button
          const parentLink = $(this).closest('a');
          if (parentLink.length > 0) {
            const href = parentLink.attr('href');
            if (href && !href.includes('#') && href !== url) {
              // Get the complete button text with size information if present
              const buttonText = $(this).text().trim();
              const buttonType = getButtonType(buttonText);
              
              // Determine button type from button text or appearance
              let type = 'Download';
              if (buttonText.includes('Fast [Resumable]')) {
                type = 'Fast-Server';
              } else if (buttonText.includes('Drive-[No Login]')) {
                type = 'V-Cloud';
              } else if (buttonText.includes('Drive-[GDToT]')) {
                type = 'GDToT';
              } else if (buttonText.includes('Drive-[Sharer]')) {
                type = 'Sharer';
              } else if (buttonText.includes('Batch/Zip')) {
                type = 'Batch/Zip';
              }
              
              extractedLinks.push({
                // Preserve the full button text including size
                buttonLabel: buttonText,
                type: type,
                link: href
              });
              
              console.log(`Found direct download button: ${buttonText} -> ${href}`);
            }
          }
        });
        
        // Also look for direct links in alerts/warning boxes that might contain instructions
        $('.alert').each(function() {
          const alertText = $(this).text().trim();
          $(this).find('a').each(function() {
            const href = $(this).attr('href');
            if (href && !href.includes('#') && href !== url) {
              const linkText = $(this).text().trim();
              let type = 'Download';
              
              // Try to determine type from context
              if (alertText.includes('Fast Server') || alertText.includes('V-Cloud')) {
                type = 'V-Cloud';
              } else if (alertText.includes('G-Direct')) {
                type = 'G-Direct';
              }
              
              extractedLinks.push({
                buttonLabel: linkText || type,
                type: type,
                link: href
              });
              
              console.log(`Found link in alert: ${linkText || type} -> ${href}`);
            }
          });
        });
        
        // If we found links through fallback method, return them
        if (extractedLinks.length > 0) {
          console.log(`Found ${extractedLinks.length} links through fallback extraction`);
          return extractedLinks;
        }
      }
      
      return standardResults;
    }
  } catch (error) {
    console.error(`Error fetching Nexdrive links: ${error.message}`);
    return [];
  }
}

module.exports = { getMovieList, getMovieDetails, fetchNextdriveLinks }; 